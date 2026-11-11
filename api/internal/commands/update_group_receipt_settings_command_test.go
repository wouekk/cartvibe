package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"testing"
)

func TestUpdateGroupReceiptSettingsCommand_Validate_ValidInputs(t *testing.T) {
	userId := uint(2)

	tests := map[string]struct {
		command UpdateGroupReceiptSettingsCommand
	}{
		// Quick Scan asks for nothing and nothing is required, so no default has to be set.
		"everything off, no defaults": {
			command: UpdateGroupReceiptSettingsCommand{},
		},
		"the person scanning pays by default": {
			command: UpdateGroupReceiptSettingsCommand{
				QuickScanDefaultPaidByType: models.QUICK_SCAN_PAID_BY_UPLOADER,
			},
		},
		"a named member pays by default": {
			command: UpdateGroupReceiptSettingsCommand{
				QuickScanDefaultPaidByType: models.QUICK_SCAN_PAID_BY_USER,
				QuickScanDefaultPaidById:   &userId,
			},
		},
		"a default status": {
			command: UpdateGroupReceiptSettingsCommand{
				QuickScanDefaultStatus: models.RESOLVED,
			},
		},
		"the note hidden while Quick Scan would ask for it": {
			command: UpdateGroupReceiptSettingsCommand{
				HideNote:             true,
				QuickScanNoteEnabled: true,
			},
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate()

			if len(vErr.Errors) > 0 {
				utils.PrintTestError(t, vErr.Errors, "no errors")
			}
		})
	}
}

func TestUpdateGroupReceiptSettingsCommand_Validate_InvalidInputs(t *testing.T) {
	zero := uint(0)

	tests := map[string]struct {
		command     UpdateGroupReceiptSettingsCommand
		expectedKey string
	}{
		"a named member without the member": {
			command: UpdateGroupReceiptSettingsCommand{
				QuickScanDefaultPaidByType: models.QUICK_SCAN_PAID_BY_USER,
			},
			expectedKey: "quickScanDefaultPaidById",
		},
		"a named member with a zero id": {
			command: UpdateGroupReceiptSettingsCommand{
				QuickScanDefaultPaidByType: models.QUICK_SCAN_PAID_BY_USER,
				QuickScanDefaultPaidById:   &zero,
			},
			expectedKey: "quickScanDefaultPaidById",
		},
		"an unknown kind of default payer": {
			command: UpdateGroupReceiptSettingsCommand{
				QuickScanDefaultPaidByType: models.QuickScanDefaultPaidByType("SOMEONE"),
			},
			expectedKey: "quickScanDefaultPaidByType",
		},
		"an unknown default status": {
			command: UpdateGroupReceiptSettingsCommand{
				QuickScanDefaultStatus: models.ReceiptStatus("NOT_A_STATUS"),
			},
			expectedKey: "quickScanDefaultStatus",
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate()

			if _, ok := vErr.Errors[test.expectedKey]; !ok {
				utils.PrintTestError(t, vErr.Errors, test.expectedKey)
			}
		})
	}
}

// What an older settings page still sends is read, not refused: a status removed in 2026-11 as what it became,
// and the switches that no longer exist are ignored.
func TestUpdateGroupReceiptSettingsCommand_ReadsWhatAnOlderPageSends(t *testing.T) {
	command := UpdateGroupReceiptSettingsCommand{}
	body := []byte(`{"quickScanDefaultStatus":"NEEDS_ATTENTION","quickScanPaidByEnabled":true,"quickScanPaidByRequired":true,"hideComments":true}`)
	if err := json.Unmarshal(body, &command); err != nil {
		t.Fatal(err)
	}

	if command.QuickScanDefaultStatus != models.OPEN {
		t.Errorf("NEEDS_ATTENTION should read OPEN, got %q", command.QuickScanDefaultStatus)
	}
	if vErr := command.Validate(); len(vErr.Errors) > 0 {
		t.Errorf("unexpected errors: %v", vErr.Errors)
	}
}
