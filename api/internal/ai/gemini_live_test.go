//go:build liveai

package ai

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

// Live check of the Gemini client against Google, on made-up receipts only. It never runs in CI: it needs the
// liveai build tag and a key in GEMINI_API_KEY (a free-tier key is enough; prompts there may be used by Google, so
// no real receipts). GEMINI_MODEL picks the model, default gemini-3.5-flash.
//
//	GEMINI_API_KEY=... go test -tags liveai -run TestGeminiLive -v ./internal/ai/
//
// It proves the client path (key, JSON mode, thinking and temperature settings for the model, parsing of the
// answer), not the production receipt prompt, which lives in services.

const liveReceiptPrompt = `Read this receipt. Answer with minified JSON only:
{"shopName":"","currency":"ISO 4217","amount":0,"date":"YYYY-MM-DD","products":[{"name":"as printed","amount":0}]}
Amounts are what was paid, exactly as printed, never converted. Leave out what you cannot read.
Receipt text: `

type liveReceipt struct {
	name     string
	text     string
	currency string
	amount   float64
	products int
}

var liveReceipts = []liveReceipt{
	{
		name: "polish grocery",
		text: "BIEDRONKA\nul. Testowa 1, Warszawa\nMLEKO 3,2% 1L   4,29\nCHLEB WIEJSKI   5,49\nJABLKA LUZ 1,2kg   7,19\nSUMA PLN   16,97\nKARTA   16,97\n2026-10-21 18:42",
		currency: "PLN", amount: 16.97, products: 3,
	},
	{
		name: "german restaurant",
		text: "Gasthaus Zur Linde\nTisch 7\n2x Pils 0,3l   7,60\n1x Schnitzel   16,90\n1x Apfelstrudel   6,50\nSumme EUR   31,00\nBar   31,00\n19.10.2026",
		currency: "EUR", amount: 31.00, products: 3,
	},
	{
		name: "ride",
		text: "Quick Ride\nTrip 20 Oct 2026\nFare  CHF 18.40\nBooking fee  CHF 1.50\nTotal  CHF 19.90\nPaid by card",
		currency: "CHF", amount: 19.90, products: 1,
	},
}

type liveAnswer struct {
	ShopName string  `json:"shopName"`
	Currency string  `json:"currency"`
	Amount   float64 `json:"amount"`
	Date     string  `json:"date"`
	Products []struct {
		Name   string  `json:"name"`
		Amount float64 `json:"amount"`
	} `json:"products"`
}

func TestGeminiLive(t *testing.T) {
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		t.Skip("GEMINI_API_KEY is not set")
	}
	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = "gemini-3.5-flash"
	}

	for index, receipt := range liveReceipts {
		t.Run(receipt.name, func(t *testing.T) {
			// A free-tier key allows only a few requests a minute.
			if index > 0 {
				time.Sleep(7 * time.Second)
			}

			client := NewGeminiClient(
				structs.AiChatCompletionOptions{
					Messages: []structs.AiClientMessage{{Role: "user", Content: liveReceiptPrompt + receipt.text}},
				},
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
			t.Logf("answered in %s: %s", time.Since(started).Round(time.Millisecond), result.Response)

			var answer liveAnswer
			if err := json.Unmarshal([]byte(result.Response), &answer); err != nil {
				t.Fatalf("answer is not the expected JSON: %v", err)
			}
			if !strings.EqualFold(answer.Currency, receipt.currency) {
				t.Errorf("currency = %q, want %q", answer.Currency, receipt.currency)
			}
			if diff := answer.Amount - receipt.amount; diff > 0.005 || diff < -0.005 {
				t.Errorf("amount = %v, want %v", answer.Amount, receipt.amount)
			}
			if len(answer.Products) < receipt.products {
				t.Errorf("products = %d, want at least %d", len(answer.Products), receipt.products)
			}
		})
	}
}
