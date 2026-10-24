package commands

import (
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"
	"time"
)

// SetReceiptDateCommand changes only a receipt's date (a calendar day, "2026-10-21"), e.g. from the view page of a
// settled receipt.
type SetReceiptDateCommand struct {
	Date string `json:"date"`
}

func (command *SetReceiptDateCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	return json.Unmarshal(bytes, command)
}

// Day is the date as midnight UTC, the way a receipt's calendar day is stored.
func (command *SetReceiptDateCommand) Day() (time.Time, error) {
	return time.Parse(time.DateOnly, command.Date)
}

func (command *SetReceiptDateCommand) Validate() structs.ValidatorError {
	errors := make(map[string]string)

	if command.Date == "" {
		errors["date"] = "Date is required"
	} else if _, err := command.Day(); err != nil {
		errors["date"] = "Date must be a day as yyyy-MM-dd"
	}

	return structs.ValidatorError{Errors: errors}
}
