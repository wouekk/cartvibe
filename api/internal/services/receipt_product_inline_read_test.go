package services

import (
	"strings"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

const inlineAnswerWithProducts = "```json\n" + `{"name": "Edeka", "shopName": "Edeka", "currency": "", "amount": 12.5,
	"products": [
		{"name": "BANANEN", "displayName": "Bananas", "amount": 1.52, "quantity": "1.2 kg", "health": "HEALTHY", "foodGroup": "fresh produce", "seasonality": "OUT_OF_SEASON"},
		{"name": "SCHOKOLADE", "displayName": "Chocolate", "amount": 1.99, "health": "UNHEALTHY", "foodGroup": "sweets & snacks", "seasonality": "NOT_PRODUCE"}
	]}` + "\n```"

func queueInlineReceipt(t *testing.T) models.Receipt {
	t.Helper()
	receipt := seedExtractionReceipt(t, true)
	if err := repositories.NewReceiptProductRepository(nil).MarkReceiptProductsPending(receipt.ID); err != nil {
		t.Fatalf("queue: %v", err)
	}
	return receipt
}

func TestApplyInlineReadStoresTheProductsOfTheScanAnswer(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := queueInlineReceipt(t)

	applied, err := NewReceiptProductExtractionService(nil).ApplyInlineRead(receipt.ID, inlineAnswerWithProducts)
	if err != nil || !applied {
		t.Fatalf("expected the products applied, got %v, %v", applied, err)
	}

	products, extraction, err := repositories.NewReceiptProductRepository(nil).GetReceiptProducts(receipt.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(products) != 2 || products[0].Name != "BANANEN" || products[1].Health != "UNHEALTHY" {
		t.Errorf("unexpected products %+v", products)
	}
	if products[0].ClassifiedAt == nil {
		t.Errorf("a classified product should be finished, got %+v", products[0])
	}
	if extraction == nil || extraction.Status != models.PRODUCT_EXTRACTION_DONE {
		t.Errorf("expected the read DONE, got %+v", extraction)
	}

	var stored models.Receipt
	repositories.GetDB().First(&stored, receipt.ID)
	if stored.Status != models.RESOLVED {
		t.Errorf("a read receipt still to check becomes Done, got %s", stored.Status)
	}
}

func TestApplyInlineReadLeavesAnAnswerWithoutProductsToTheSweep(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := queueInlineReceipt(t)

	for _, answer := range []string{`{"name": "Edeka", "amount": 12.5}`, `not json`, `{"products": "none"}`, ``} {
		applied, err := NewReceiptProductExtractionService(nil).ApplyInlineRead(receipt.ID, answer)
		if err != nil || applied {
			t.Errorf("%q: expected nothing applied, got %v, %v", answer, applied, err)
		}
	}

	if extraction := readExtraction(t, receipt.ID); extraction.Status != models.PRODUCT_EXTRACTION_PENDING {
		t.Errorf("expected the receipt still waiting for the sweep, got %s", extraction.Status)
	}
}

func TestApplyInlineReadNeverTakesAReceiptTheSweepHolds(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := queueInlineReceipt(t)

	repository := repositories.NewReceiptProductRepository(nil)
	if _, ok, err := repository.ClaimDueExtraction(time.Now().Add(time.Second)); err != nil || !ok {
		t.Fatalf("sweep claim: %v, %v", ok, err)
	}

	applied, err := NewReceiptProductExtractionService(nil).ApplyInlineRead(receipt.ID, inlineAnswerWithProducts)
	if err != nil || applied {
		t.Errorf("expected the sweep's claim to win, got %v, %v", applied, err)
	}
	if products, _, _ := repository.GetReceiptProducts(receipt.ID); len(products) != 0 {
		t.Errorf("expected no products written, got %+v", products)
	}
}

func TestInlineProductPromptSharesTheProductRules(t *testing.T) {
	month := time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC)
	inline := buildInlineProductPrompt(month, "", nil)
	standalone := buildProductExtractionPrompt(month, "", nil)

	rules := productLineRules("October 2026", "", nil)
	if !strings.Contains(inline, rules) || !strings.Contains(standalone, rules) {
		t.Fatalf("both prompts must carry the same product rules")
	}
	if !strings.Contains(inline, `"products"`) || strings.Contains(inline, `"shop":"..."`) {
		t.Errorf("the inline part asks for products only (the receipt prompt already asks for the shop): %s", inline)
	}
	if !strings.Contains(standalone, `Reply with minified JSON only`) || !strings.Contains(standalone, `{"shop":"..."`) {
		t.Errorf("the sweep's prompt must keep its own answer shape")
	}
}

func TestQuickScanStoresTheProductsOfItsOwnAnswer(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, _, _, err := runQuickScan(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		nil,
		nil,
		func(u models.User, g models.Group) string {
			return `{"name": "Edeka", "amount": 3.51, "date": "2024-07-07T00:00:00Z", "products": [
				{"name": "BANANEN", "displayName": "Bananas", "amount": 1.52, "health": "HEALTHY", "foodGroup": "fresh produce", "seasonality": "OUT_OF_SEASON"},
				{"name": "SCHOKOLADE", "displayName": "Chocolate", "amount": 1.99, "health": "UNHEALTHY", "foodGroup": "sweets & snacks", "seasonality": "NOT_PRODUCE"}
			]}`
		},
	)
	if err != nil {
		t.Fatalf("quick scan: %v", err)
	}

	products, extraction, err := repositories.NewReceiptProductRepository(nil).GetReceiptProducts(created.ID)
	if err != nil {
		t.Fatalf("get products: %v", err)
	}
	if len(products) != 2 {
		t.Fatalf("expected the scan's two products stored without a second read, got %+v", products)
	}
	if extraction == nil || extraction.Status != models.PRODUCT_EXTRACTION_DONE {
		t.Errorf("expected the read DONE, got %+v", extraction)
	}
}

func TestQuickScanPromptAsksForTheProductsBeforeTheReceiptText(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestGroupWithUsers()

	group := models.Group{}
	group.ID = 1
	service := ReceiptProcessingService{Group: group, IncludeProducts: true}
	prompt, _, err := service.buildPrompt(models.ReceiptProcessingSettings{}, "LIDL 3,51")
	if err != nil {
		t.Fatalf("build prompt: %v", err)
	}

	products := strings.Index(prompt, `Also add a "products" key`)
	text := strings.Index(prompt, "Receipt text: LIDL 3,51")
	if products < 0 || text < 0 || products > text {
		t.Errorf("expected the products part before the receipt text, got %d and %d", products, text)
	}

	service.IncludeProducts = false
	plain, _, _ := service.buildPrompt(models.ReceiptProcessingSettings{}, "LIDL 3,51")
	if strings.Contains(plain, `"products"`) {
		t.Errorf("magic fill must not ask for products")
	}
}
