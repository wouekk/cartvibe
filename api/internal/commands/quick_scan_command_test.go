package commands

import (
	"mime/multipart"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/utils"
	"strings"
	"testing"
)

type mockFile struct {
	*strings.Reader
}

func (m mockFile) Close() error {
	return nil
}

func newMockFile() multipart.File {
	return mockFile{Reader: strings.NewReader("mock file content")}
}

func TestQuickScanCommand_Validate_ValidInputs(t *testing.T) {
	tests := map[string]struct {
		command QuickScanCommand
	}{
		"valid with single file": {
			command: QuickScanCommand{
				Files:         []multipart.File{newMockFile()},
				PaidByUserIds: []uint{1},
				GroupIds:      []uint{1},
				Statuses:      []models.ReceiptStatus{"OPEN"},
			},
		},
		"valid with multiple files": {
			command: QuickScanCommand{
				Files:         []multipart.File{newMockFile(), newMockFile()},
				PaidByUserIds: []uint{1, 2},
				GroupIds:      []uint{1, 1},
				Statuses:      []models.ReceiptStatus{"OPEN", "OPEN"},
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

func TestQuickScanCommand_Validate_InvalidInputs(t *testing.T) {
	tests := map[string]struct {
		command        QuickScanCommand
		expectedErrors []string
	}{
		"no files": {
			command:        QuickScanCommand{},
			expectedErrors: []string{"files", "paidByUserId", "groupId", "status"},
		},
		"mismatched paid by user ids": {
			command: QuickScanCommand{
				Files:         []multipart.File{newMockFile(), newMockFile()},
				PaidByUserIds: []uint{1},
				GroupIds:      []uint{1, 1},
				Statuses:      []models.ReceiptStatus{"OPEN", "OPEN"},
			},
			expectedErrors: []string{"paidByUserId"},
		},
		"mismatched group ids": {
			command: QuickScanCommand{
				Files:         []multipart.File{newMockFile(), newMockFile()},
				PaidByUserIds: []uint{1, 2},
				GroupIds:      []uint{1},
				Statuses:      []models.ReceiptStatus{"OPEN", "OPEN"},
			},
			expectedErrors: []string{"groupIds"},
		},
		"mismatched statuses": {
			command: QuickScanCommand{
				Files:         []multipart.File{newMockFile(), newMockFile()},
				PaidByUserIds: []uint{1, 2},
				GroupIds:      []uint{1, 1},
				Statuses:      []models.ReceiptStatus{"OPEN"},
			},
			expectedErrors: []string{"statuses"},
		},
		"all arrays empty with no files": {
			command: QuickScanCommand{
				Files:         []multipart.File{},
				PaidByUserIds: []uint{},
				GroupIds:      []uint{},
				Statuses:      []models.ReceiptStatus{},
			},
			expectedErrors: []string{"files", "paidByUserId", "groupId", "status"},
		},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			vErr := test.command.Validate()

			if len(vErr.Errors) == 0 {
				utils.PrintTestError(t, len(vErr.Errors), "greater than 0")
			}

			for _, expectedError := range test.expectedErrors {
				if _, exists := vErr.Errors[expectedError]; !exists {
					utils.PrintTestError(t, "error should exist for field", expectedError)
				}
			}
		})
	}
}
