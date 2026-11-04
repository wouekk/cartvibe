//go:build liveai

package services

import (
	"cartvibe/api/internal/ai"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

// Live check of the production receipt prompt against Gemini, on made-up receipts only. It never runs in CI: it needs the
// liveai build tag and a key in GEMINI_API_KEY (a free-tier key is enough; prompts there may be used by Google, so no real
// receipts). GEMINI_MODEL picks the model, default gemini-3.5-flash. It needs the cgo libraries of the services package
// (ImageMagick, Tesseract), so run it where the API builds: the Linux build container, not plain Windows.
//
//	GEMINI_API_KEY=... go test -tags liveai -run TestReceiptPromptLive -v ./internal/services/
//
// It sends DefaultReceiptPrompt (what every receipt read uses) plus the inline products part of a quick scan
// (buildInlineProductPrompt) with a category list, exactly as buildPrompt assembles them, and checks the total, the currency,
// the product lines and the categories of the answer. The ai package's own live test covers the client path alone.

// The household's categories, as getCategoriesString offers them to the AI.
var liveCategories = []struct {
	Id          uint   `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}{
	{1, "Groceries", "food and drink bought to eat at home"},
	{2, "Restaurant", "eating out, cafes, bars and takeaway"},
	{3, "Transport", "taxi, ride-hailing, public transport, fuel and parking"},
	{4, "Household", "cleaning, home supplies and small appliances"},
	{5, "Leisure", "books, games, hobbies, cinema and events"},
}

type livePromptReceipt struct {
	name       string
	text       string
	currency   string
	amount     float64
	lines      int    // at least this many product lines
	categoryId uint   // must be among the (up to two) categories the AI picks
	note       string // what the receipt is meant to catch
}

var livePromptReceipts = []livePromptReceipt{
	{
		name: "polish grocery",
		text: "BIEDRONKA\nul. Testowa 1, 00-001 Warszawa\nNIP 000-000-00-00\nMLEKO 3,2% 1L   4,29\nCHLEB WIEJSKI   5,49\nJABLKA LUZ 1,2kg   7,19\nCZEKOLADA MILKA   5,99\nSUMA PLN   22,96\nKARTA   22,96\n2026-10-21 18:42",
		currency: "PLN", amount: 22.96, lines: 4, categoryId: 1,
		note: "a plain grocery receipt with a decimal comma",
	},
	{
		name: "german restaurant",
		text: "Gasthaus Zur Linde\nMusterstr. 5, Berlin\nTisch 7\n2x Pils 0,3l   7,60\n1x Schnitzel   16,90\n1x Apfelstrudel   6,50\nSumme EUR   31,00\nDavon MwSt 19%   4,95\nBar   31,00\nVielen Dank!\n19.10.2026",
		currency: "EUR", amount: 31.00, lines: 3, categoryId: 2,
		note: "a restaurant bill with the tax printed inside the total",
	},
	{
		name: "french invoice with VAT printed net",
		text: "Papeterie du Marche\n12 rue des Tests, 75001 Paris\nFACTURE 2026-0412   le 18/10/2026\nCahier A4 x5   12,50 € HT\nStylos x10   8,33 € HT\nClasseur   20,84 € HT\nTOTAL HT   41,67 €\nTVA 20%   8,33 €\nTOTAL TTC   50,00 €\nPayé par carte",
		currency: "EUR", amount: 50.00, lines: 3, categoryId: 4,
		note: "lines are printed net of VAT; the amount is the total paid (TTC), and the lines should add up to it",
	},
	{
		name: "ride bill",
		text: "Quick Ride\nTrip receipt\nSaturday 17 Oct 2026, 22:14\nFare   CHF 18.40\nBooking fee   CHF 1.50\nTotal   CHF 19.90\nPaid by card ending 0000",
		currency: "CHF", amount: 19.90, lines: 1, categoryId: 3,
		note: "a ride bill: not food, CHF, the total includes the fee",
	},
}

type livePromptAnswer struct {
	Name       string  `json:"name"`
	ShopName   string  `json:"shopName"`
	Currency   string  `json:"currency"`
	Amount     float64 `json:"amount"`
	Date       string  `json:"date"`
	Categories []struct {
		Id uint `json:"id"`
	} `json:"categories"`
	Products []struct {
		Name   string  `json:"name"`
		Amount float64 `json:"amount"`
	} `json:"products"`
}

// livePromptFor assembles what buildPrompt would: the template variables filled in and the inline products part placed
// right before the receipt text.
func livePromptFor(t *testing.T, receiptText string) string {
	t.Helper()
	categories, err := json.Marshal(liveCategories)
	if err != nil {
		t.Fatal(err)
	}
	prompt := strings.NewReplacer(
		"@categories", string(categories),
		"@tags", "[]",
		"@currentYear", "2026",
	).Replace(DefaultReceiptPrompt)
	month := time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC)
	prompt = strings.Replace(prompt, "\nReceipt text: ", buildInlineProductPrompt(month, "", nil, "English")+"\n\nReceipt text: ", 1)
	return strings.Replace(prompt, "@ocrText", receiptText, 1)
}

func TestReceiptPromptLive(t *testing.T) {
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		t.Skip("GEMINI_API_KEY is not set")
	}
	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = "gemini-3.5-flash"
	}

	for index, receipt := range livePromptReceipts {
		t.Run(receipt.name, func(t *testing.T) {
			// A free-tier key allows only a few requests a minute.
			if index > 0 {
				time.Sleep(8 * time.Second)
			}
			prompt := livePromptFor(t, receipt.text)
			if strings.Contains(prompt, "@") && strings.Contains(prompt, "@ocrText") {
				t.Fatalf("a template variable is left in the prompt")
			}

			client := ai.NewGeminiClient(
				structs.AiChatCompletionOptions{Messages: []structs.AiClientMessage{{Role: "user", Content: prompt}}},
				models.ReceiptProcessingSettings{Model: model, Key: key, EnforceJsonResponseFormat: true},
			)

			// Google answers 503 (busy) and 429 (rate limit) now and then; the app retries those later, so does this.
			started := time.Now()
			var result structs.ChatCompletionResult
			var err error
			for attempt := 1; attempt <= 3; attempt++ {
				result, err = client.GetChatCompletion()
				if err == nil || !(strings.Contains(err.Error(), "503") || strings.Contains(err.Error(), "429")) {
					break
				}
				t.Logf("attempt %d: %v", attempt, err)
				time.Sleep(time.Duration(attempt) * 15 * time.Second)
			}
			if err != nil {
				t.Fatalf("GetChatCompletion: %v", err)
			}
			t.Logf("%s; answered in %s: %s", receipt.note, time.Since(started).Round(time.Millisecond), result.Response)

			var answer livePromptAnswer
			if err := json.Unmarshal([]byte(result.Response), &answer); err != nil {
				t.Fatalf("answer is not the expected JSON: %v", err)
			}

			if !strings.EqualFold(answer.Currency, receipt.currency) {
				t.Errorf("currency = %q, want %q", answer.Currency, receipt.currency)
			}
			if diff := answer.Amount - receipt.amount; diff > 0.005 || diff < -0.005 {
				t.Errorf("amount = %v, want %v", answer.Amount, receipt.amount)
			}
			if answer.ShopName == "" && answer.Name == "" {
				t.Errorf("neither name nor shopName was read")
			}
			if len(answer.Products) < receipt.lines {
				t.Errorf("product lines = %d, want at least %d", len(answer.Products), receipt.lines)
			}

			// Every category id must be one that was offered, and the expected one must be among them.
			offered := map[uint]bool{}
			for _, category := range liveCategories {
				offered[category.Id] = true
			}
			picked := false
			for _, category := range answer.Categories {
				if !offered[category.Id] {
					t.Errorf("category id %d was never offered", category.Id)
				}
				if category.Id == receipt.categoryId {
					picked = true
				}
			}
			if len(answer.Categories) > 2 {
				t.Errorf("%d categories, the prompt allows 2", len(answer.Categories))
			}
			if !picked {
				t.Errorf("categories = %v, want id %d among them", answer.Categories, receipt.categoryId)
			}

			// The lines are what was paid: they add up to the total (a net-priced invoice is grossed up, see the prompt).
			var sum float64
			for _, product := range answer.Products {
				sum += product.Amount
			}
			if diff := sum - receipt.amount; len(answer.Products) > 0 && (diff > 0.05 || diff < -0.05) {
				t.Errorf("%s", fmt.Sprintf("product lines add up to %.2f, the total is %.2f", sum, receipt.amount))
			}
		})
	}
}
