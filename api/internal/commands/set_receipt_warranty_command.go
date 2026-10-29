package commands

import (
	"encoding/json"
	"net/http"
	"time"

	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

// SetReceiptWarrantyCommand sets or clears a receipt's warranty end (a calendar day, "2028-10-29"); null or ""
// clears it.
type SetReceiptWarrantyCommand struct {
	WarrantyUntil *string `json:"warrantyUntil"`
}

func (command *SetReceiptWarrantyCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	return json.Unmarshal(bytes, command)
}

// Day is the warranty end to store: nil clears it.
func (command *SetReceiptWarrantyCommand) Day() *string {
	if command.WarrantyUntil == nil || *command.WarrantyUntil == "" {
		return nil
	}
	day := *command.WarrantyUntil
	return &day
}

func (command *SetReceiptWarrantyCommand) Validate() structs.ValidatorError {
	errors := make(map[string]string)

	if day := command.Day(); day != nil {
		parsed, err := time.Parse(time.DateOnly, *day)
		if err != nil || parsed.Format(time.DateOnly) != *day {
			errors["warrantyUntil"] = "Warranty date must be a day as yyyy-MM-dd"
		}
	}

	return structs.ValidatorError{Errors: errors}
}

// UpsertPushSubscriptionCommand is a browser's PushSubscription as the Push API serializes it.
type UpsertPushSubscriptionCommand struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

func (command *UpsertPushSubscriptionCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	return json.Unmarshal(bytes, command)
}
