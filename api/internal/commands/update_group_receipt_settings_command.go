package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"
)

// UpdateGroupReceiptSettingsCommand is a household's receipt settings as its settings page sends them (see
// models.GroupReceiptSettings for what each means). Nothing in Quick Scan is ever required, and the only field a
// household can add to it is the note.
type UpdateGroupReceiptSettingsCommand struct {
	HideImages            bool `json:"hideImages"`
	HideReceiptCategories bool `json:"hideReceiptCategories"`
	HideReceiptTags       bool `json:"hideReceiptTags"`
	HideNote              bool `json:"hideNote"`

	QuickScanNoteEnabled bool `json:"quickScanNoteEnabled"`

	// QuickScanDefaultPaidByType says who paid when a scan does not: "" or UPLOADER is the person scanning, USER
	// is the member named by QuickScanDefaultPaidById.
	QuickScanDefaultPaidByType models.QuickScanDefaultPaidByType `json:"quickScanDefaultPaidByType"`
	QuickScanDefaultPaidById   *uint                             `json:"quickScanDefaultPaidById"`
	// QuickScanDefaultStatus is the status of a scan that names none; "" is OPEN ("To check").
	QuickScanDefaultStatus models.ReceiptStatus `json:"quickScanDefaultStatus"`
}

func (command *UpdateGroupReceiptSettingsCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &command)
	if err != nil {
		return err
	}

	return nil
}

func (command UpdateGroupReceiptSettingsCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{
		Errors: make(map[string]string),
	}

	switch command.QuickScanDefaultPaidByType {
	case "", models.QUICK_SCAN_PAID_BY_UPLOADER:
		// The person scanning; no id needed.
	case models.QUICK_SCAN_PAID_BY_USER:
		if command.QuickScanDefaultPaidById == nil || *command.QuickScanDefaultPaidById == 0 {
			vErr.Errors["quickScanDefaultPaidById"] = "Choose who pays by default"
		}
	default:
		vErr.Errors["quickScanDefaultPaidByType"] = "Unknown default for paid by"
	}

	if command.QuickScanDefaultStatus != "" && !isValidReceiptStatus(command.QuickScanDefaultStatus) {
		vErr.Errors["quickScanDefaultStatus"] = "Unknown default status"
	}

	return vErr
}

func (command *UpdateGroupReceiptSettingsCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		return structs.ValidatorError{}, err
	}

	vErr := command.Validate()
	if len(vErr.Errors) > 0 {
		return vErr, nil
	}

	return structs.ValidatorError{}, nil
}

func isValidReceiptStatus(status models.ReceiptStatus) bool {
	for _, valid := range models.ReceiptStatuses() {
		if valid == status {
			return true
		}
	}
	return false
}
