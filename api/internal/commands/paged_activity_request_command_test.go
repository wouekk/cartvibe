package commands

import (
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestPagedActivityRequestCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command PagedActivityRequestCommand
	}{
		"valid with group ids": {
			command: PagedActivityRequestCommand{
				PagedRequestCommand: PagedRequestCommand{
					Page:          1,
					PageSize:      10,
					SortDirection: ASCENDING,
				},
				GroupIds: []uint{1, 2, 3},
			},
		},
		"valid with single group id": {
			command: PagedActivityRequestCommand{
				PagedRequestCommand: PagedRequestCommand{
					Page:          1,
					PageSize:      10,
					SortDirection: DEFAULT,
				},
				GroupIds: []uint{1},
			},
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate()

			if len(vErr.Errors) > 0 {
				utils.PrintTestError(t, len(vErr.Errors), 0)
			}
		})
	}
}

func TestPagedActivityRequestCommand_Validate_InvalidInputs(t *testing.T) {
	tests := map[string]struct {
		command       PagedActivityRequestCommand
		expectedError string
	}{
		"empty group ids": {
			command: PagedActivityRequestCommand{
				PagedRequestCommand: PagedRequestCommand{
					Page:          1,
					PageSize:      10,
					SortDirection: ASCENDING,
				},
				GroupIds: []uint{},
			},
			expectedError: "groupIds",
		},
		"nil group ids": {
			command: PagedActivityRequestCommand{
				PagedRequestCommand: PagedRequestCommand{
					Page:          1,
					PageSize:      10,
					SortDirection: ASCENDING,
				},
			},
			expectedError: "groupIds",
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate()

			if len(vErr.Errors) == 0 {
				utils.PrintTestError(t, len(vErr.Errors), "greater than 0")
			}

			if _, exists := vErr.Errors[test.expectedError]; !exists {
				utils.PrintTestError(t, "error should exist for field", test.expectedError)
			}
		})
	}
}

func TestPagedActivityRequestCommand_Validate_InheritedErrors(t *testing.T) {
	command := PagedActivityRequestCommand{
		PagedRequestCommand: PagedRequestCommand{
			Page:          0,
			PageSize:      0,
			SortDirection: "invalid",
		},
		GroupIds: []uint{},
	}

	vErr := command.Validate()

	if len(vErr.Errors) != 4 {
		utils.PrintTestError(t, len(vErr.Errors), 4)
	}

	if _, exists := vErr.Errors["page"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "page")
	}

	if _, exists := vErr.Errors["pageSize"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "pageSize")
	}

	if _, exists := vErr.Errors["sortDirection"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "sortDirection")
	}

	if _, exists := vErr.Errors["groupIds"]; !exists {
		utils.PrintTestError(t, "error should exist for field", "groupIds")
	}
}
