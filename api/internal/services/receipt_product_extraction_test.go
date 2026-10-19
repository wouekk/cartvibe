package services

import (
	"encoding/json"
	"errors"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

var errBadAnswerForTest = errors.New("the answer was not JSON")

func TestParseProductResponseToleratesModelSloppiness(t *testing.T) {
	response := `{"products": [
		{"name": "LAIT DEMI-ECR 1L", "displayName": "Semi-skimmed milk 1 L", "amount": 1.09, "quantity": "1"},
		{"name": "BANANES", "displayName": "Bananas", "amount": "1,52 €", "quantity": 1.25},
		{"name": "  ", "amount": 3},
		{"name": "SAC", "displayName": "Bag", "quantity": null}
	]}`

	products, err := parseProductResponse(response)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(products) != 3 {
		t.Fatalf("expected the nameless line dropped, got %+v", products)
	}

	if products[0].Amount == nil || products[0].Amount.String() != "1.09" || products[0].Quantity != "1" {
		t.Errorf("unexpected first product %+v", products[0])
	}
	if products[1].Amount == nil || products[1].Amount.String() != "1.52" || products[1].Quantity != "1.25" {
		t.Errorf("expected a comma amount and a numeric quantity to be read, got %+v", products[1])
	}
	if products[2].Amount != nil || products[2].Quantity != "" {
		t.Errorf("expected no amount and no quantity, got %+v", products[2])
	}
}

func TestParseProductResponseRejectsTheWrongShape(t *testing.T) {
	for _, response := range []string{`not json`, `{"items": []}`, `[]`} {
		if _, err := parseProductResponse(response); err == nil {
			t.Errorf("expected %q to be rejected", response)
		}
	}

	products, err := parseProductResponse(`{"products": []}`)
	if err != nil || len(products) != 0 {
		t.Errorf("an empty list is a valid answer, got %v, %v", products, err)
	}
}

func TestParseLooseAmount(t *testing.T) {
	tests := map[string]string{
		`2.5`:          "2.5",
		`"1,09"`:       "1.09",
		`"€ 1,234.50"`: "1234.5",
		`"-0.50"`:      "-0.5",
		`1.005`:        "1.01",
	}
	for raw, expected := range tests {
		amount := parseLooseAmount(json.RawMessage(raw))
		if amount == nil || !amount.Equal(decimal.RequireFromString(expected)) {
			t.Errorf("%s: expected %s, got %v", raw, expected, amount)
		}
	}

	for _, raw := range []string{``, `null`, `"free"`, `{}`} {
		if amount := parseLooseAmount(json.RawMessage(raw)); amount != nil {
			t.Errorf("%q: expected no amount, got %v", raw, amount)
		}
	}
}

func TestParseProductResponseTruncatesLongText(t *testing.T) {
	long := strings.Repeat("ż", models.MaxReceiptProductNameLength+20)
	products, err := parseProductResponse(`{"products": [{"name": "` + long + `"}]}`)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := len([]rune(products[0].Name)); got != models.MaxReceiptProductNameLength {
		t.Errorf("expected the name cut to %d characters, got %d", models.MaxReceiptProductNameLength, got)
	}
}

func seedExtractionReceipt(t *testing.T, withImage bool) models.Receipt {
	t.Helper()
	repositories.CreateTestGroupWithUsers()

	receipt := models.Receipt{
		Name:         "Supermarket",
		Amount:       decimal.RequireFromString("12.50"),
		Date:         time.Now(),
		PaidByUserID: 1,
		GroupId:      1,
		Status:       models.OPEN,
	}
	if err := repositories.GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}
	if withImage {
		image := models.FileData{Name: "receipt.jpg", FileType: "image/jpeg", ReceiptId: receipt.ID}
		if err := repositories.GetDB().Create(&image).Error; err != nil {
			t.Fatalf("seed image: %v", err)
		}
	}
	return receipt
}

func readExtraction(t *testing.T, receiptId uint) models.ReceiptProductExtraction {
	t.Helper()
	var extraction models.ReceiptProductExtraction
	if err := repositories.GetDB().Where("receipt_id = ?", receiptId).Take(&extraction).Error; err != nil {
		t.Fatalf("read extraction: %v", err)
	}
	return extraction
}

func TestProductExtractionWaitsOutAMissingAi(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, true)
	repository := repositories.NewReceiptProductRepository(nil)
	if err := repository.MarkReceiptProductsPending(receipt.ID); err != nil {
		t.Fatalf("queue: %v", err)
	}

	processed, err := NewReceiptProductExtractionService(nil).ProcessDueExtractions()
	if err != nil || processed != 1 {
		t.Fatalf("expected one receipt processed, got %d (%v)", processed, err)
	}

	extraction := readExtraction(t, receipt.ID)
	if extraction.Status != models.PRODUCT_EXTRACTION_UNAVAILABLE {
		t.Errorf("expected UNAVAILABLE without an AI configured, got %s (%s)", extraction.Status, extraction.LastError)
	}
	if time.Until(extraction.NextAttemptAt) < 50*time.Minute {
		t.Errorf("expected the retry about an hour out, got %s", extraction.NextAttemptAt)
	}
	if extraction.Attempts != 0 {
		t.Errorf("an outage must not count as a bad answer, got %d attempts", extraction.Attempts)
	}

	// Not due again yet, so the next sweep leaves it alone.
	processed, _ = NewReceiptProductExtractionService(nil).ProcessDueExtractions()
	if processed != 0 {
		t.Errorf("expected nothing due, processed %d", processed)
	}
}

func TestProductExtractionFailsAReceiptWithoutImages(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, false)
	if err := repositories.NewReceiptProductRepository(nil).MarkReceiptProductsPending(receipt.ID); err != nil {
		t.Fatalf("queue: %v", err)
	}

	if _, err := NewReceiptProductExtractionService(nil).ProcessDueExtractions(); err != nil {
		t.Fatalf("process: %v", err)
	}

	if extraction := readExtraction(t, receipt.ID); extraction.Status != models.PRODUCT_EXTRACTION_FAILED {
		t.Errorf("expected FAILED for a receipt with no image, got %s", extraction.Status)
	}
}

func TestBadAnswersAreRetriedThenGivenUp(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, true)
	repository := repositories.NewReceiptProductRepository(nil)
	if err := repository.MarkReceiptProductsPending(receipt.ID); err != nil {
		t.Fatalf("queue: %v", err)
	}
	service := NewReceiptProductExtractionService(nil)

	for attempt := 1; attempt <= productExtractionMaxBadAnswers; attempt++ {
		extraction := readExtraction(t, receipt.ID)
		if err := service.recordBadAnswer(extraction, errBadAnswerForTest); err != nil {
			t.Fatalf("record: %v", err)
		}
	}

	extraction := readExtraction(t, receipt.ID)
	if extraction.Status != models.PRODUCT_EXTRACTION_FAILED || extraction.Attempts != productExtractionMaxBadAnswers {
		t.Errorf("expected FAILED after %d bad answers, got %s with %d", productExtractionMaxBadAnswers, extraction.Status, extraction.Attempts)
	}
}

func TestAnOutageIsGivenUpAfterTheRetryWindow(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, true)
	repository := repositories.NewReceiptProductRepository(nil)
	if err := repository.MarkReceiptProductsPending(receipt.ID); err != nil {
		t.Fatalf("queue: %v", err)
	}

	extraction := readExtraction(t, receipt.ID)
	extraction.CreatedAt = time.Now().Add(-productExtractionRetryWindow - time.Hour)
	if err := NewReceiptProductExtractionService(nil).recordOutage(extraction, errNoAiConfigured); err != nil {
		t.Fatalf("record: %v", err)
	}

	if got := readExtraction(t, receipt.ID).Status; got != models.PRODUCT_EXTRACTION_FAILED {
		t.Errorf("expected FAILED past the retry window, got %s", got)
	}
}

func TestClaimHandsEachDueExtractionOutOnce(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, true)
	repository := repositories.NewReceiptProductRepository(nil)
	if err := repository.MarkReceiptProductsPending(receipt.ID); err != nil {
		t.Fatalf("queue: %v", err)
	}

	now := time.Now()
	first, ok, err := repository.ClaimDueExtraction(now)
	if err != nil || !ok || first.ReceiptId != receipt.ID {
		t.Fatalf("expected to claim the receipt, got %+v %v %v", first, ok, err)
	}

	if _, ok, _ := repository.ClaimDueExtraction(now); ok {
		t.Error("a claimed extraction must not be handed out again while its lease runs")
	}

	// A sweep that died leaves it RUNNING; it is due again once the lease is over.
	if again, ok, _ := repository.ClaimDueExtraction(now.Add(time.Hour)); !ok || again.ReceiptId != receipt.ID {
		t.Error("expected a lapsed lease to be claimable")
	}
}

func TestReplaceProductsStoresTheSetAndCompletesTheRead(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, true)
	repository := repositories.NewReceiptProductRepository(nil)
	if err := repository.MarkReceiptProductsPending(receipt.ID); err != nil {
		t.Fatalf("queue: %v", err)
	}

	amount := decimal.RequireFromString("1.09")
	first := []models.ReceiptProduct{{ReceiptId: receipt.ID, Name: "LAIT", Amount: &amount, Position: 0}, {ReceiptId: receipt.ID, Name: "PAIN", Position: 1}}
	if err := repository.ReplaceProducts(receipt.ID, first); err != nil {
		t.Fatalf("replace: %v", err)
	}
	if err := repository.ReplaceProducts(receipt.ID, []models.ReceiptProduct{{ReceiptId: receipt.ID, Name: "OEUFS"}}); err != nil {
		t.Fatalf("replace again: %v", err)
	}

	products, extraction, err := repository.GetReceiptProducts(receipt.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(products) != 1 || products[0].Name != "OEUFS" {
		t.Errorf("expected the second read to replace the first, got %+v", products)
	}
	if extraction == nil || extraction.Status != models.PRODUCT_EXTRACTION_DONE {
		t.Errorf("expected DONE, got %+v", extraction)
	}
}
