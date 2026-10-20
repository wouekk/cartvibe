package services

import (
	"encoding/json"
	"strings"
	"testing"

	"receipt-wrangler/api/internal/models"
)

func customFieldFixtures() []models.CustomField {
	return []models.CustomField{
		{BaseModel: models.BaseModel{ID: 1}, Name: "Store note", Type: models.TEXT},
		{BaseModel: models.BaseModel{ID: 2}, Name: "Due", Type: models.DATE},
		{BaseModel: models.BaseModel{ID: 3}, Name: "Payment", Type: models.SELECT, Options: []models.CustomFieldOption{
			{BaseModel: models.BaseModel{ID: 10}, Value: "Card"},
			{BaseModel: models.BaseModel{ID: 11}, Value: "Cash"},
		}},
		{BaseModel: models.BaseModel{ID: 4}, Name: "Tip", Type: models.CURRENCY},
		{BaseModel: models.BaseModel{ID: 5}, Name: "Warranty", Type: models.BOOLEAN},
	}
}

func TestSplitAiCustomFields_ReadsEveryType(t *testing.T) {
	response := `{"name":"Shop","customFields":[
		{"customFieldId":1,"stringValue":" hello "},
		{"customFieldId":2,"dateValue":"2026-03-04"},
		{"customFieldId":3,"selectValue":11},
		{"customFieldId":4,"currencyValue":"2.50"},
		{"customFieldId":5,"booleanValue":true}]}`

	remaining, values := splitAiCustomFields(response, customFieldFixtures())

	if strings.Contains(remaining, "customFields") || !strings.Contains(remaining, `"name":"Shop"`) {
		t.Fatalf("expected the rest of the answer without customFields, got %s", remaining)
	}
	if len(values) != 5 {
		t.Fatalf("expected 5 values, got %d", len(values))
	}
	if *values[0].StringValue != "hello" {
		t.Errorf("text not trimmed: %q", *values[0].StringValue)
	}
	if values[1].DateValue.Format("2006-01-02 15:04 MST") != "2026-03-04 00:00 UTC" {
		t.Errorf("date not midnight UTC: %v", values[1].DateValue)
	}
	if *values[2].SelectValue != 11 || values[3].CurrencyValue.StringFixed(2) != "2.50" || !*values[4].BooleanValue {
		t.Errorf("unexpected values: %+v", values)
	}

	var rest map[string]interface{}
	if err := json.Unmarshal([]byte(remaining), &rest); err != nil {
		t.Errorf("remaining answer is not valid JSON: %v", err)
	}
}

func TestSplitAiCustomFields_DropsWhatDoesNotFit(t *testing.T) {
	response := `{"customFields":[
		{"customFieldId":99,"stringValue":"unknown field"},
		{"customFieldId":2,"dateValue":"last Tuesday"},
		{"customFieldId":3,"selectValue":42},
		{"customFieldId":4,"currencyValue":"lots"},
		{"customFieldId":5,"booleanValue":"maybe"},
		{"customFieldId":1,"stringValue":"first"},
		{"customFieldId":1,"stringValue":"second"},
		{"stringValue":"no id"}]}`

	_, values := splitAiCustomFields(response, customFieldFixtures())

	if len(values) != 1 || *values[0].StringValue != "first" {
		t.Fatalf("expected only the first valid text value, got %+v", values)
	}
}

func TestSplitAiCustomFields_AbsentOrMalformedIsEmptyNotNil(t *testing.T) {
	for _, response := range []string{`{"name":"Shop"}`, `{"customFields":"nope"}`, `not json`} {
		_, values := splitAiCustomFields(response, customFieldFixtures())
		if values == nil || len(values) != 0 {
			t.Errorf("%s: expected an empty, non-nil slice, got %#v", response, values)
		}
	}
}

func TestBuildCustomFieldsString_ListsOptions(t *testing.T) {
	result, err := buildCustomFieldsString(customFieldFixtures())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(result, `"options":[{"id":10,"value":"Card"}`) || !strings.Contains(result, `"type":"CURRENCY"`) {
		t.Errorf("unexpected prompt text: %s", result)
	}

	empty, _ := buildCustomFieldsString(nil)
	if empty != "[]" {
		t.Errorf("expected [] for no fields, got %s", empty)
	}
}
