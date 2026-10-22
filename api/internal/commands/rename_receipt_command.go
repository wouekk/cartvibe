package commands

import (
	"encoding/json"
	"net/http"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"strings"
	"unicode/utf8"
)

// MaxReceiptNameLength keeps a typed name to something a list row can show.
const MaxReceiptNameLength = 255

type RenameReceiptCommand struct {
	Name string `json:"name"`
}

func (command *RenameReceiptCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	return json.Unmarshal(bytes, command)
}

// Validate trims the name first, so a whitespace-only one counts as empty like the desktop's required check.
func (command *RenameReceiptCommand) Validate() structs.ValidatorError {
	errors := make(map[string]string)
	command.Name = strings.TrimSpace(command.Name)

	if len(command.Name) == 0 {
		errors["name"] = "Name is required"
	} else if utf8.RuneCountInString(command.Name) > MaxReceiptNameLength {
		errors["name"] = "Name is too long"
	}

	return structs.ValidatorError{Errors: errors}
}
