package models

import (
	"encoding/json"
	"cartvibe/api/internal/utils"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func TestReceipt_ToString(t *testing.T) {
	receipt := Receipt{
		BaseModel: BaseModel{ID: 1},
		Name:      "Test Receipt",
		Amount:    decimal.NewFromFloat(12.34),
		Date:      time.Now(),
		Status:    OPEN,
		GroupId:   2,
	}

	result, err := receipt.ToString()
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}

	// The result must be valid JSON that round-trips the key fields.
	var decoded map[string]interface{}
	if unmarshalErr := json.Unmarshal([]byte(result), &decoded); unmarshalErr != nil {
		utils.PrintTestError(t, unmarshalErr, nil)
	}

	if decoded["name"] != "Test Receipt" {
		utils.PrintTestError(t, decoded["name"], "Test Receipt")
	}
}

// A receipt whose associations were not loaded (the paged list without fullReceipts) still sends them
// as arrays, by value and by pointer, and loaded ones are kept.
func TestReceipt_MarshalsUnloadedListsAsEmptyArrays(t *testing.T) {
	receipt := Receipt{BaseModel: BaseModel{ID: 1}, Name: "Unloaded"}

	for _, value := range []interface{}{receipt, &receipt, []Receipt{receipt}} {
		bytes, err := json.Marshal(value)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		body := string(bytes)
		for _, field := range []string{`"categories":[]`, `"tags":[]`, `"imageFiles":[]`, `"comments":[]`} {
			if !strings.Contains(body, field) {
				t.Errorf("expected %s in %s", field, body)
			}
		}
		if !strings.Contains(body, `"name":"Unloaded"`) {
			t.Errorf("expected the receipt's own fields in %s", body)
		}
	}

	loaded := Receipt{Tags: []Tag{{Name: "Kids"}}}
	bytes, err := json.Marshal(loaded)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(bytes), `"name":"Kids"`) {
		t.Errorf("expected the loaded tag in %s", bytes)
	}
	if loaded.Categories != nil {
		t.Errorf("marshalling must not change the receipt")
	}
}
