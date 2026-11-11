package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
)

// ReceiptStatus is where a receipt stands for the household: still to check, or settled. Those are the only
// two (2026-11, audit D6): the three more that upstream had for approving a business expense were shown as
// one of these two for a long time, and the data migration two-receipt-statuses-v1 rewrote the stored rows.
type ReceiptStatus string

const (
	// OPEN reads "To check" in the app.
	OPEN ReceiptStatus = "OPEN"
	// RESOLVED reads "Settled".
	RESOLVED ReceiptStatus = "RESOLVED"
)

// The statuses that no longer exist. A stored report template, a backup file, a scan queued on a phone before
// the update or an older client may still name one, so what comes in goes through NormalizeReceiptStatus.
const (
	legacyNeedsAttention ReceiptStatus = "NEEDS_ATTENTION"
	legacyDraft          ReceiptStatus = "DRAFT"
	legacyDeclined       ReceiptStatus = "DECLINED"
)

// NormalizeReceiptStatus maps a removed status onto the one it was shown as: NEEDS_ATTENTION and DRAFT were
// "To check", DECLINED was "Settled". Anything else, a status of today or an unknown text, comes back as it is.
func NormalizeReceiptStatus(status ReceiptStatus) ReceiptStatus {
	switch status {
	case legacyNeedsAttention, legacyDraft:
		return OPEN
	case legacyDeclined:
		return RESOLVED
	default:
		return status
	}
}

// Scan reads a status from a form field (Quick Scan), a removed one as what it became.
func (self *ReceiptStatus) Scan(value string) error {
	*self = NormalizeReceiptStatus(ReceiptStatus(value))
	return nil
}

// UnmarshalJSON reads a status from a request body, a removed one as what it became, so every command that
// carries a status accepts what an older client or a stored setting still sends.
func (self *ReceiptStatus) UnmarshalJSON(data []byte) error {
	var raw *string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if raw == nil {
		*self = ""
		return nil
	}
	*self = NormalizeReceiptStatus(ReceiptStatus(*raw))
	return nil
}

func (self ReceiptStatus) Value() (driver.Value, error) {
	if self != OPEN && self != RESOLVED && self != "" {
		return nil, errors.New("invalid receiptStatus")
	}
	return string(self), nil
}

func ReceiptStatuses() []interface{} {
	return []interface{}{OPEN, RESOLVED}
}
