package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"github.com/shopspring/decimal"
	"strings"
	"testing"
	"time"
)

func validReceiptCommand() UpsertReceiptCommand {
	return UpsertReceiptCommand{
		Name:         "Test Receipt",
		Amount:       decimal.NewFromFloat(25.50),
		Date:         time.Now(),
		GroupId:      1,
		PaidByUserID: 1,
		Status:       models.ReceiptStatus("OPEN"),
	}
}

func TestUpsertReceiptCommand_Validate_MissingFields(t *testing.T) {
	tests := map[string]struct {
		modify        func(cmd *UpsertReceiptCommand)
		expectedError string
	}{
		"missing name": {
			modify:        func(cmd *UpsertReceiptCommand) { cmd.Name = "" },
			expectedError: "name",
		},
		"missing date": {
			modify:        func(cmd *UpsertReceiptCommand) { cmd.Date = time.Time{} },
			expectedError: "date",
		},
		"missing groupId": {
			modify:        func(cmd *UpsertReceiptCommand) { cmd.GroupId = 0 },
			expectedError: "groupId",
		},
		"missing paidByUserId": {
			modify:        func(cmd *UpsertReceiptCommand) { cmd.PaidByUserID = 0 },
			expectedError: "paidByUserId",
		},
		"missing status": {
			modify:        func(cmd *UpsertReceiptCommand) { cmd.Status = "" },
			expectedError: "status",
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			cmd := validReceiptCommand()
			test.modify(&cmd)

			vErr := cmd.Validate(1, true)

			if _, exists := vErr.Errors[test.expectedError]; !exists {
				utils.PrintTestError(t, "error should exist for field", test.expectedError)
			}
		})
	}
}

func TestUpsertReceiptCommand_Validate_NestedCategoryErrors(t *testing.T) {
	cmd := validReceiptCommand()
	cmd.Categories = []UpsertCategoryCommand{{Name: ""}}

	vErr := cmd.Validate(1, true)

	if _, exists := vErr.Errors["categories.0.name"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "categories.0.name")
	}
}

func TestUpsertReceiptCommand_Validate_NestedTagErrors(t *testing.T) {
	cmd := validReceiptCommand()
	cmd.Tags = []UpsertTagCommand{{Name: ""}}

	vErr := cmd.Validate(1, true)

	if _, exists := vErr.Errors["tags.0.name"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "tags.0.name")
	}
}

func TestUpsertReceiptCommand_Validate_Note(t *testing.T) {
	cmd := validReceiptCommand()

	// No note at all (an older client, the AI's answer) is fine, and so are an empty one and a long one.
	if vErr := cmd.Validate(1, true); len(vErr.Errors) > 0 {
		t.Errorf("no note: %v", vErr.Errors)
	}
	empty := ""
	cmd.Note = &empty
	if vErr := cmd.Validate(1, true); len(vErr.Errors) > 0 {
		t.Errorf("an empty note: %v", vErr.Errors)
	}
	// The limit counts characters, not bytes: this is the limit in two-byte letters.
	atLimit := strings.Repeat("ż", models.MaxReceiptNoteLength)
	cmd.Note = &atLimit
	if vErr := cmd.Validate(1, true); len(vErr.Errors) > 0 {
		t.Errorf("a note at the limit: %v", vErr.Errors)
	}

	tooLong := atLimit + "ż"
	cmd.Note = &tooLong
	vErr := cmd.Validate(1, true)
	if _, exists := vErr.Errors["note"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "note")
	}
}

// The key decides: absent or null leaves the stored note alone (nil), "" clears it.
func TestUpsertReceiptCommand_NoteKeyAbsentNullOrEmpty(t *testing.T) {
	cases := map[string]*string{
		`{"name":"Lunch"}`:                nil,
		`{"name":"Lunch","note":null}`:    nil,
		`{"name":"Lunch","note":""}`:      strPtr(""),
		`{"name":"Lunch","note":"hello"}`: strPtr("hello"),
		// What an older client sent while a receipt had comments is ignored, not an error.
		`{"name":"Lunch","comments":[{"comment":"old"}]}`: nil,
	}
	for body, want := range cases {
		var cmd UpsertReceiptCommand
		if err := json.Unmarshal([]byte(body), &cmd); err != nil {
			t.Fatalf("%s: %v", body, err)
		}
		if (cmd.Note == nil) != (want == nil) || (want != nil && *cmd.Note != *want) {
			t.Errorf("%s: note = %v, want %v", body, cmd.Note, want)
		}
	}
}

func TestUpsertReceiptCommand_Validate_EmptyCommand(t *testing.T) {
	command := UpsertReceiptCommand{}

	vErr := command.Validate(1, true)

	// name, date, groupId, paidByUserId, status
	if len(vErr.Errors) < 5 {
		utils.PrintTestError(t, len(vErr.Errors), "at least 5")
	}
}
