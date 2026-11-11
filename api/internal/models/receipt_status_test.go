package models

import (
	"cartvibe/api/internal/utils"
	"encoding/json"
	"testing"
)

func TestReceiptStatus_Value(t *testing.T) {
	valid := []ReceiptStatus{OPEN, RESOLVED}
	for _, v := range valid {
		assertValuerValid(t, string(v), v, string(v))
	}

	// An empty value is accepted and normalized to "".
	assertValuerValid(t, "empty", ReceiptStatus(""), "")
}

func TestReceiptStatus_Value_Invalid(t *testing.T) {
	assertValuerInvalid(t, "bogus", ReceiptStatus("bogus"))
	// A removed status is never stored: what comes in is normalized before it gets here.
	assertValuerInvalid(t, "removed", ReceiptStatus("NEEDS_ATTENTION"))
}

func TestReceiptStatus_Scan(t *testing.T) {
	var status ReceiptStatus
	err := status.Scan("OPEN")
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if status != OPEN {
		utils.PrintTestError(t, status, OPEN)
	}
}

func TestReceiptStatuses(t *testing.T) {
	statuses := ReceiptStatuses()

	expected := []interface{}{OPEN, RESOLVED}
	if len(statuses) != len(expected) {
		utils.PrintTestError(t, len(statuses), len(expected))
	}

	for i, v := range expected {
		if statuses[i] != v {
			utils.PrintTestError(t, statuses[i], v)
		}
	}
}

// The three statuses removed in 2026-11 still arrive from stored report templates, backup files, scans queued on
// a phone before the update and older clients: each reads as what the app showed it as.
func TestNormalizeReceiptStatus(t *testing.T) {
	cases := map[ReceiptStatus]ReceiptStatus{
		"OPEN":            OPEN,
		"RESOLVED":        RESOLVED,
		"NEEDS_ATTENTION": OPEN,
		"DRAFT":           OPEN,
		"DECLINED":        RESOLVED,
		"":                "",
		"SOMETHING_ELSE":  "SOMETHING_ELSE",
	}
	for given, want := range cases {
		if got := NormalizeReceiptStatus(given); got != want {
			t.Errorf("%q normalizes to %q, want %q", given, got, want)
		}
	}
}

func TestReceiptStatus_ARemovedStatusIsReadAsWhatItBecame(t *testing.T) {
	var fromForm ReceiptStatus
	if err := fromForm.Scan("DRAFT"); err != nil || fromForm != OPEN {
		t.Errorf("a form's DRAFT should read OPEN, got %q (%v)", fromForm, err)
	}

	var body struct {
		Status  ReceiptStatus `json:"status"`
		Default ReceiptStatus `json:"default"`
		Missing ReceiptStatus `json:"missing"`
		Null    ReceiptStatus `json:"null"`
	}
	err := json.Unmarshal([]byte(`{"status":"DECLINED","default":"RESOLVED","null":null}`), &body)
	if err != nil {
		t.Fatal(err)
	}
	if body.Status != RESOLVED || body.Default != RESOLVED || body.Missing != "" || body.Null != "" {
		t.Errorf("got %+v", body)
	}

	if err := json.Unmarshal([]byte(`{"status":7}`), &body); err == nil {
		t.Error("a status that is not text should be refused")
	}
}
