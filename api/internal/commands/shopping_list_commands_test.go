package commands

import (
	"net/http/httptest"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/utils"
	"strings"
	"testing"
)

func TestUpsertShoppingListCommand_Validate(t *testing.T) {
	tests := map[string]struct {
		command       UpsertShoppingListCommand
		expectedError string
	}{
		"valid":            {command: UpsertShoppingListCommand{Name: "Supermarket"}},
		"exactly max":      {command: UpsertShoppingListCommand{Name: strings.Repeat("a", models.MaxShoppingListNameLength)}},
		"max multibyte":    {command: UpsertShoppingListCommand{Name: strings.Repeat("ż", models.MaxShoppingListNameLength)}},
		"missing name":     {command: UpsertShoppingListCommand{}, expectedError: "name"},
		"name over length": {command: UpsertShoppingListCommand{Name: strings.Repeat("a", models.MaxShoppingListNameLength+1)}, expectedError: "name"},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate()
			assertSingleValidationError(t, vErr.Errors, test.expectedError)
		})
	}
}

func TestUpsertShoppingListCommand_LoadDataFromRequestTrimsName(t *testing.T) {
	r := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"   "}`))
	command := UpsertShoppingListCommand{}

	vErr, err := command.LoadDataFromRequestAndValidate(httptest.NewRecorder(), r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// A whitespace-only name is trimmed to empty, so it is rejected rather than stored as blanks.
	assertSingleValidationError(t, vErr.Errors, "name")
}

func TestUpsertShoppingListItemCommand_Validate(t *testing.T) {
	tests := map[string]struct {
		command       UpsertShoppingListItemCommand
		expectedError string
	}{
		"name only":    {command: UpsertShoppingListItemCommand{Name: "Milk"}},
		"all fields":   {command: UpsertShoppingListItemCommand{Name: "Milk", Quantity: "2 l", Note: "lactose free"}},
		"missing name": {command: UpsertShoppingListItemCommand{Quantity: "2"}, expectedError: "name"},
		"name over length": {
			command:       UpsertShoppingListItemCommand{Name: strings.Repeat("a", models.MaxShoppingListItemNameLength+1)},
			expectedError: "name",
		},
		"quantity over length": {
			command:       UpsertShoppingListItemCommand{Name: "Milk", Quantity: strings.Repeat("1", models.MaxShoppingListItemQuantityLength+1)},
			expectedError: "quantity",
		},
		"note over length": {
			command:       UpsertShoppingListItemCommand{Name: "Milk", Note: strings.Repeat("n", models.MaxShoppingListItemNoteLength+1)},
			expectedError: "note",
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate()
			assertSingleValidationError(t, vErr.Errors, test.expectedError)
		})
	}
}

func TestUpsertShoppingListItemCommand_LoadDataFromRequestTrimsFields(t *testing.T) {
	r := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"  Milk ","quantity":" 2 ","note":"  "}`))
	command := UpsertShoppingListItemCommand{}

	vErr, err := command.LoadDataFromRequestAndValidate(httptest.NewRecorder(), r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	assertSingleValidationError(t, vErr.Errors, "")

	if command.Name != "Milk" || command.Quantity != "2" || command.Note != "" {
		utils.PrintTestError(t, command, UpsertShoppingListItemCommand{Name: "Milk", Quantity: "2"})
	}
}

func TestSetShoppingListItemCheckedCommand(t *testing.T) {
	tests := map[string]struct {
		body          string
		expectedError string
		expected      bool
	}{
		"checked":     {body: `{"isChecked":true}`, expected: true},
		"unchecked":   {body: `{"isChecked":false}`, expected: false},
		"missing key": {body: `{}`, expectedError: "isChecked"},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			r := httptest.NewRequest("PUT", "/", strings.NewReader(test.body))
			command := SetShoppingListItemCheckedCommand{}

			vErr, err := command.LoadDataFromRequestAndValidate(httptest.NewRecorder(), r)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			assertSingleValidationError(t, vErr.Errors, test.expectedError)

			if test.expectedError == "" && *command.IsChecked != test.expected {
				utils.PrintTestError(t, *command.IsChecked, test.expected)
			}
		})
	}
}

// assertSingleValidationError expects no errors when expectedKey is empty, otherwise exactly one
// error, keyed expectedKey.
func assertSingleValidationError(t *testing.T, errs map[string]string, expectedKey string) {
	t.Helper()

	if expectedKey == "" {
		if len(errs) > 0 {
			t.Errorf("expected no validation errors, got %v", errs)
		}
		return
	}

	if len(errs) != 1 {
		t.Errorf("expected exactly one validation error (%s), got %v", expectedKey, errs)
		return
	}
	if _, ok := errs[expectedKey]; !ok {
		t.Errorf("expected a validation error on %s, got %v", expectedKey, errs)
	}
}
