package services

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"mime/multipart"
	"strings"
	"testing"
)

// seedQuickScanGroup creates a group (id 1) with the given quick-scan receipt settings.
func seedQuickScanGroup(settings models.GroupReceiptSettings) {
	repositories.CreateTestGroup()
	repository := repositories.NewGroupReceiptSettingsRepository(nil)
	if _, err := repository.CreateGroupReceiptSettings(1); err != nil {
		panic(err)
	}

	command := commands.UpdateGroupReceiptSettingsCommand{
		HideNote:                   settings.HideNote,
		QuickScanPaidByEnabled:     settings.QuickScanPaidByEnabled,
		QuickScanDefaultPaidByType: settings.QuickScanDefaultPaidByType,
		QuickScanDefaultPaidById:   settings.QuickScanDefaultPaidById,
		QuickScanStatusEnabled:     settings.QuickScanStatusEnabled,
		QuickScanDefaultStatus:     settings.QuickScanDefaultStatus,
		QuickScanCategoriesEnabled: settings.QuickScanCategoriesEnabled,
		QuickScanTagsEnabled:       settings.QuickScanTagsEnabled,
		QuickScanNoteEnabled:       settings.QuickScanNoteEnabled,
	}
	if _, err := repository.UpdateGroupReceiptSettings("1", command); err != nil {
		panic(err)
	}
}

func singleFileCommand(paidBy uint, status models.ReceiptStatus, categoryIds []uint, tagIds []uint, note string) commands.QuickScanCommand {
	return commands.QuickScanCommand{
		Files:         []multipart.File{nil},
		GroupIds:      []uint{1},
		PaidByUserIds: []uint{paidBy},
		Statuses:      []models.ReceiptStatus{status},
		CategoryIds:   [][]uint{categoryIds},
		TagIds:        [][]uint{tagIds},
		Notes:         []string{note},
	}
}

func resolveOne(t *testing.T, command commands.QuickScanCommand, uploader uint) (ResolvedQuickScanFields, map[string]string) {
	t.Helper()
	resolved, configErr, err := NewReceiptService(nil).ResolveQuickScanFields(command, uploader)
	if err != nil {
		t.Fatal(err)
	}
	return resolved[0], configErr.Errors
}

// A new household: Quick Scan asks for nothing, and a scan that says nothing is paid by the person scanning
// and is to check.
func TestResolveQuickScanFields_AScanThatSaysNothingGetsThePersonScanningAndToCheck(t *testing.T) {
	defer repositories.TruncateTestDb()
	seedQuickScanGroup(models.GroupReceiptSettings{})

	resolved, errors := resolveOne(t, singleFileCommand(0, "", []uint{}, []uint{}, ""), 42)

	if len(errors) > 0 {
		t.Errorf("nothing is required, got %v", errors)
	}
	if resolved.PaidByUserId != 42 || resolved.Status != models.OPEN {
		t.Errorf("got paid by %d, status %s; want 42, OPEN", resolved.PaidByUserId, resolved.Status)
	}
}

// Asking for every field requires none of them.
func TestResolveQuickScanFields_NothingIsRequiredEvenWhenEveryFieldIsAskedFor(t *testing.T) {
	defer repositories.TruncateTestDb()
	seedQuickScanGroup(models.GroupReceiptSettings{
		QuickScanPaidByEnabled: true, QuickScanStatusEnabled: true, QuickScanCategoriesEnabled: true,
		QuickScanTagsEnabled: true, QuickScanNoteEnabled: true,
	})

	resolved, errors := resolveOne(t, singleFileCommand(0, "", []uint{}, []uint{}, ""), 42)

	if len(errors) > 0 {
		t.Errorf("nothing is required, got %v", errors)
	}
	if resolved.PaidByUserId != 42 || resolved.Status != models.OPEN || resolved.Note != "" {
		t.Errorf("got %+v", resolved)
	}
}

func TestResolveQuickScanFields_TheHouseholdsDefaults(t *testing.T) {
	defer repositories.TruncateTestDb()
	defaultUser := uint(7)
	seedQuickScanGroup(models.GroupReceiptSettings{
		QuickScanDefaultPaidByType: models.QUICK_SCAN_PAID_BY_USER,
		QuickScanDefaultPaidById:   &defaultUser,
		QuickScanDefaultStatus:     models.RESOLVED,
	})

	resolved, _ := resolveOne(t, singleFileCommand(0, "", []uint{}, []uint{}, ""), 42)

	if resolved.PaidByUserId != 7 || resolved.Status != models.RESOLVED {
		t.Errorf("got paid by %d, status %s; want the household's 7, RESOLVED", resolved.PaidByUserId, resolved.Status)
	}
}

func TestResolveQuickScanFields_UploaderDefault(t *testing.T) {
	defer repositories.TruncateTestDb()
	seedQuickScanGroup(models.GroupReceiptSettings{
		QuickScanDefaultPaidByType: models.QUICK_SCAN_PAID_BY_UPLOADER,
	})

	resolved, _ := resolveOne(t, singleFileCommand(0, "", []uint{}, []uint{}, ""), 42)

	if resolved.PaidByUserId != 42 {
		t.Errorf("paid by %d, want the person scanning (42)", resolved.PaidByUserId)
	}
}

func TestResolveQuickScanFields_ProvidedValuesKept(t *testing.T) {
	defer repositories.TruncateTestDb()
	defaultUser := uint(7)
	seedQuickScanGroup(models.GroupReceiptSettings{
		QuickScanPaidByEnabled:     true,
		QuickScanDefaultPaidByType: models.QUICK_SCAN_PAID_BY_USER,
		QuickScanDefaultPaidById:   &defaultUser,
		QuickScanStatusEnabled:     true,
		QuickScanDefaultStatus:     models.OPEN,
	})

	// What the scan says wins over the household's defaults.
	resolved, _ := resolveOne(t, singleFileCommand(99, models.RESOLVED, []uint{3}, []uint{4}, ""), 42)

	if resolved.PaidByUserId != 99 || resolved.Status != models.RESOLVED {
		t.Errorf("got paid by %d, status %s; want 99, RESOLVED", resolved.PaidByUserId, resolved.Status)
	}
	if len(resolved.CategoryIds) != 1 || resolved.CategoryIds[0] != 3 || len(resolved.TagIds) != 1 || resolved.TagIds[0] != 4 {
		t.Errorf("categories and tags should be kept, got %+v", resolved)
	}
}

// The note is kept only where the household's Quick Scan asks for one.
func TestResolveQuickScanFields_TheNote(t *testing.T) {
	cases := map[string]struct {
		settings models.GroupReceiptSettings
		want     string
	}{
		"asked for: kept":                     {models.GroupReceiptSettings{QuickScanNoteEnabled: true}, "for the party"},
		"not asked for: dropped":              {models.GroupReceiptSettings{}, ""},
		"asked for but hidden for the household: dropped": {models.GroupReceiptSettings{QuickScanNoteEnabled: true, HideNote: true}, ""},
	}

	for name, test := range cases {
		t.Run(name, func(t *testing.T) {
			defer repositories.TruncateTestDb()
			seedQuickScanGroup(test.settings)

			resolved, errors := resolveOne(t, singleFileCommand(0, "", []uint{}, []uint{}, "for the party"), 42)

			if len(errors) > 0 {
				t.Errorf("unexpected errors %v", errors)
			}
			if resolved.Note != test.want {
				t.Errorf("note = %q, want %q", resolved.Note, test.want)
			}
		})
	}
}

// The limit counts characters, and a note over it is refused before anything is queued.
func TestResolveQuickScanFields_ANoteThatIsTooLongIsRefused(t *testing.T) {
	defer repositories.TruncateTestDb()
	seedQuickScanGroup(models.GroupReceiptSettings{QuickScanNoteEnabled: true})

	atLimit := strings.Repeat("ż", models.MaxReceiptNoteLength)
	_, errors := resolveOne(t, singleFileCommand(0, "", []uint{}, []uint{}, atLimit), 42)
	if len(errors) > 0 {
		t.Errorf("a note at the limit should pass, got %v", errors)
	}

	_, errors = resolveOne(t, singleFileCommand(0, "", []uint{}, []uint{}, atLimit+"ż"), 42)
	if _, refused := errors["files.0.note"]; !refused {
		t.Errorf("a note over the limit should be refused under files.0.note, got %v", errors)
	}

	// Where the household does not ask for a note, a long one is dropped, not refused.
	repositories.TruncateTestDb()
	seedQuickScanGroup(models.GroupReceiptSettings{})
	resolved, errors := resolveOne(t, singleFileCommand(0, "", []uint{}, []uint{}, atLimit+"ż"), 42)
	if len(errors) > 0 || resolved.Note != "" {
		t.Errorf("a note nobody asked for should be dropped quietly, got %q %v", resolved.Note, errors)
	}
}
