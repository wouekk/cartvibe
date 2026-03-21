package commands

import (
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestUpsertCommentCommand_Validate_ValidInputs(t *testing.T) {
	userId := uint(1)

	tests := map[string]struct {
		command       UpsertCommentCommand
		userRequestId uint
		isCreate      bool
	}{
		"valid create": {
			command: UpsertCommentCommand{
				Comment: "A comment",
				UserId:  &userId,
			},
			userRequestId: 1,
			isCreate:      true,
		},
		"valid update with matching user id": {
			command: UpsertCommentCommand{
				Comment:   "A comment",
				ReceiptId: 1,
				UserId:    &userId,
			},
			userRequestId: 1,
			isCreate:      false,
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate(test.userRequestId, test.isCreate)

			if len(vErr.Errors) > 0 {
				utils.PrintTestError(t, len(vErr.Errors), 0)
			}
		})
	}
}

func TestUpsertCommentCommand_Validate_InvalidInputs(t *testing.T) {
	userId := uint(1)
	wrongUserId := uint(99)

	tests := map[string]struct {
		command       UpsertCommentCommand
		userRequestId uint
		isCreate      bool
		expectedError string
	}{
		"missing comment": {
			command: UpsertCommentCommand{
				ReceiptId: 1,
				UserId:    &userId,
			},
			userRequestId: 1,
			isCreate:      false,
			expectedError: "comment",
		},
		"missing receipt id on update": {
			command: UpsertCommentCommand{
				Comment: "A comment",
				UserId:  &userId,
			},
			userRequestId: 1,
			isCreate:      false,
			expectedError: "receiptId",
		},
		"nil user id": {
			command: UpsertCommentCommand{
				Comment:   "A comment",
				ReceiptId: 1,
			},
			userRequestId: 1,
			isCreate:      false,
			expectedError: "userId",
		},
		"user id mismatch on update": {
			command: UpsertCommentCommand{
				Comment:   "A comment",
				ReceiptId: 1,
				UserId:    &wrongUserId,
			},
			userRequestId: 1,
			isCreate:      false,
			expectedError: "userId",
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate(test.userRequestId, test.isCreate)

			if len(vErr.Errors) == 0 {
				utils.PrintTestError(t, len(vErr.Errors), "greater than 0")
			}

			if _, exists := vErr.Errors[test.expectedError]; !exists {
				utils.PrintTestError(t, "error should exist for field", test.expectedError)
			}
		})
	}
}

func TestUpsertCommentCommand_Validate_ReceiptIdNotRequiredOnCreate(t *testing.T) {
	userId := uint(1)
	command := UpsertCommentCommand{
		Comment: "A comment",
		UserId:  &userId,
	}

	vErr := command.Validate(1, true)

	if len(vErr.Errors) != 0 {
		utils.PrintTestError(t, len(vErr.Errors), 0)
	}
}

func TestUpsertCommentCommand_Validate_UserIdMismatchIgnoredOnCreate(t *testing.T) {
	wrongUserId := uint(99)
	command := UpsertCommentCommand{
		Comment: "A comment",
		UserId:  &wrongUserId,
	}

	vErr := command.Validate(1, true)

	if len(vErr.Errors) != 0 {
		utils.PrintTestError(t, len(vErr.Errors), 0)
	}
}
