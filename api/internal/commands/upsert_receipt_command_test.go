package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"github.com/shopspring/decimal"
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

func TestUpsertReceiptCommand_Validate_NestedCommentErrors(t *testing.T) {
	cmd := validReceiptCommand()
	cmd.Comments = []UpsertCommentCommand{{}}

	vErr := cmd.Validate(1, true)

	if _, exists := vErr.Errors["comments.0.comment"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "comments.0.comment")
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
