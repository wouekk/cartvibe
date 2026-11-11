package commands

import (
	"bytes"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"mime/multipart"
	"net/http/httptest"
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
		"valid with category and tag selections": {
			command: QuickScanCommand{
				Files:         []multipart.File{newMockFile(), newMockFile()},
				PaidByUserIds: []uint{1, 2},
				GroupIds:      []uint{1, 1},
				Statuses:      []models.ReceiptStatus{"OPEN", "OPEN"},
				CategoryIds:   [][]uint{{1, 2}, {}},
				TagIds:        [][]uint{{}, {5}},
			},
		},
		"valid with notes": {
			command: QuickScanCommand{
				Files:         []multipart.File{newMockFile(), newMockFile()},
				PaidByUserIds: []uint{1, 2},
				GroupIds:      []uint{1, 1},
				Statuses:      []models.ReceiptStatus{"OPEN", "OPEN"},
				Notes:         []string{"a note", ""},
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
		"mismatched category ids": {
			command: QuickScanCommand{
				Files:         []multipart.File{newMockFile(), newMockFile()},
				PaidByUserIds: []uint{1, 2},
				GroupIds:      []uint{1, 1},
				Statuses:      []models.ReceiptStatus{"OPEN", "OPEN"},
				CategoryIds:   [][]uint{{1}},
			},
			expectedErrors: []string{"categoryIds"},
		},
		"mismatched tag ids": {
			command: QuickScanCommand{
				Files:         []multipart.File{newMockFile(), newMockFile()},
				PaidByUserIds: []uint{1, 2},
				GroupIds:      []uint{1, 1},
				Statuses:      []models.ReceiptStatus{"OPEN", "OPEN"},
				TagIds:        [][]uint{{1}},
			},
			expectedErrors: []string{"tagIds"},
		},
		"mismatched notes": {
			command: QuickScanCommand{
				Files:         []multipart.File{newMockFile(), newMockFile()},
				PaidByUserIds: []uint{1, 2},
				GroupIds:      []uint{1, 1},
				Statuses:      []models.ReceiptStatus{"OPEN", "OPEN"},
				Notes:         []string{"only one"},
			},
			expectedErrors: []string{"notes"},
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

func TestQuickScanCommand_CategoryAndTagIdsForFile(t *testing.T) {
	command := QuickScanCommand{
		CategoryIds: [][]uint{{1, 2}},
		TagIds:      [][]uint{{9}},
	}

	if got := command.CategoryIdsForFile(0); len(got) != 2 || got[0] != 1 || got[1] != 2 {
		utils.PrintTestError(t, got, []uint{1, 2})
	}

	// Out-of-range index (client omitted selections for this file) yields an empty slice.
	if got := command.CategoryIdsForFile(5); len(got) != 0 {
		utils.PrintTestError(t, got, []uint{})
	}

	if got := command.TagIdsForFile(0); len(got) != 1 || got[0] != 9 {
		utils.PrintTestError(t, got, []uint{9})
	}

	if got := command.TagIdsForFile(5); len(got) != 0 {
		utils.PrintTestError(t, got, []uint{})
	}
}

func TestParseCommaSeparatedUints(t *testing.T) {
	tests := map[string]struct {
		input    string
		expected []uint
	}{
		"empty string yields empty slice": {input: "", expected: []uint{}},
		"single id":                       {input: "7", expected: []uint{7}},
		"multiple ids":                    {input: "3,7,11", expected: []uint{3, 7, 11}},
		"blank segments skipped":          {input: "3,,7,", expected: []uint{3, 7}},
		"whitespace trimmed":              {input: " 3 , 7 ", expected: []uint{3, 7}},
	}

	for testName, test := range tests {
		t.Run(testName, func(t *testing.T) {
			got, err := parseCommaSeparatedUints(test.input)
			if err != nil {
				utils.PrintTestError(t, err, nil)
			}

			if len(got) != len(test.expected) {
				utils.PrintTestError(t, got, test.expected)
				return
			}

			for i := range test.expected {
				if got[i] != test.expected[i] {
					utils.PrintTestError(t, got, test.expected)
				}
			}
		})
	}
}

func TestQuickScanCommand_NoteForFile(t *testing.T) {
	command := QuickScanCommand{Notes: []string{"first", ""}}

	if command.NoteForFile(0) != "first" {
		utils.PrintTestError(t, command.NoteForFile(0), "first")
	}
	if command.NoteForFile(1) != "" {
		utils.PrintTestError(t, command.NoteForFile(1), "")
	}
	// Out of range: a client that sent no notes at all must resolve to no note rather than panic.
	if command.NoteForFile(5) != "" {
		utils.PrintTestError(t, command.NoteForFile(5), "")
	}
}

// quickScanFormCommand loads a Quick Scan request of one file with the given extra form fields.
func quickScanFormCommand(t *testing.T, fields [][2]string) QuickScanCommand {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("files", "receipt.png")
	if err != nil {
		t.Fatal(err)
	}
	part.Write([]byte("image-bytes"))

	writer.WriteField("groupIds", "1")
	writer.WriteField("paidByUserIds", "1")
	for _, field := range fields {
		writer.WriteField(field[0], field[1])
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	r := httptest.NewRequest("POST", "/api", body)
	r.Header.Set("Content-Type", writer.FormDataContentType())

	command := QuickScanCommand{}
	if err := command.LoadDataFromRequest(httptest.NewRecorder(), r); err != nil {
		t.Fatal(err)
	}
	return command
}

func TestQuickScanCommand_LoadDataFromRequestTrimsNotes(t *testing.T) {
	// A note of spaces alone is no note.
	command := quickScanFormCommand(t, [][2]string{{"statuses", "OPEN"}, {"notes", "   \n  "}})

	if len(command.Notes) != 1 || command.Notes[0] != "" {
		t.Errorf("notes = %q, want one empty note", command.Notes)
	}
}

// Until 2026-11 the note's form field was called comments. A page that was open during the update still sends
// it, and so does a scan that was queued before it.
func TestQuickScanCommand_LoadDataFromRequestReadsTheOldCommentsField(t *testing.T) {
	old := quickScanFormCommand(t, [][2]string{{"statuses", "OPEN"}, {"comments", " for the party "}})
	if len(old.Notes) != 1 || old.Notes[0] != "for the party" {
		t.Errorf("notes = %q, want the old field's text", old.Notes)
	}

	both := quickScanFormCommand(t, [][2]string{{"statuses", "OPEN"}, {"notes", "new"}, {"comments", "old"}})
	if len(both.Notes) != 1 || both.Notes[0] != "new" {
		t.Errorf("notes = %q, want the new field to win", both.Notes)
	}
}

// A status removed in 2026-11 is read as what it became.
func TestQuickScanCommand_LoadDataFromRequestReadsARemovedStatus(t *testing.T) {
	command := quickScanFormCommand(t, [][2]string{{"statuses", "NEEDS_ATTENTION"}})

	if len(command.Statuses) != 1 || command.Statuses[0] != models.OPEN {
		t.Errorf("statuses = %q, want OPEN", command.Statuses)
	}
}
