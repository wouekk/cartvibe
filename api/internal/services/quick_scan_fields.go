package services

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"fmt"
	"unicode/utf8"
)

// ResolvedQuickScanFields holds the final per-file values a quick scan will be created with, after the
// household's defaults have filled in what the person did not say.
type ResolvedQuickScanFields struct {
	PaidByUserId uint
	Status       models.ReceiptStatus
	CategoryIds  []uint
	TagIds       []uint
	Note         string
}

// ResolveQuickScanFields walks each uploaded file, loads its target household's receipt settings (cached per
// household) and fills in what the scan left empty. Nothing is ever required: a scan is a photo, and every
// other field has a value to fall back on. A non-empty ValidatorError (a note that is too long) means the
// request should 400 without queuing anything.
func (service ReceiptService) ResolveQuickScanFields(command commands.QuickScanCommand, uploaderUserId uint) ([]ResolvedQuickScanFields, structs.ValidatorError, error) {
	settingsRepository := repositories.NewGroupReceiptSettingsRepository(service.TX)
	settingsCache := make(map[uint]models.GroupReceiptSettings)
	resolved := make([]ResolvedQuickScanFields, len(command.Files))
	configErr := structs.ValidatorError{Errors: make(map[string]string)}

	for i := 0; i < len(command.Files); i++ {
		groupId := command.GroupIds[i]

		settings, cached := settingsCache[groupId]
		if !cached {
			loaded, err := settingsRepository.GetGroupReceiptSettingsByGroupId(groupId)
			if err != nil {
				return nil, structs.ValidatorError{}, err
			}
			settings = loaded
			settingsCache[groupId] = settings
		}

		// Paid by: what the scan says, else the household's default, else the person scanning.
		paidByUserId := command.PaidByUserIds[i]
		if paidByUserId == 0 {
			paidByUserId = resolveQuickScanDefaultPaidBy(settings, uploaderUserId)
		}

		// Status: what the scan says, else the household's default, else "To check".
		status := command.Statuses[i]
		if len(status) == 0 {
			status = settings.QuickScanDefaultStatus
		}
		if len(status) == 0 {
			status = models.OPEN
		}

		// A note is kept only where the household's Quick Scan asks for one: a hidden field takes nothing.
		note := command.NoteForFile(i)
		if !settings.IsQuickScanNoteShown() {
			note = ""
		} else if utf8.RuneCountInString(note) > models.MaxReceiptNoteLength {
			// Counted in characters, not bytes, and checked before the scan is queued, so the person sees the
			// reason at once.
			configErr.Errors[fmt.Sprintf("files.%d.note", i)] = fmt.Sprintf("Note must be %d characters or fewer", models.MaxReceiptNoteLength)
		}

		resolved[i] = ResolvedQuickScanFields{
			PaidByUserId: paidByUserId,
			Status:       status,
			CategoryIds:  command.CategoryIdsForFile(i),
			TagIds:       command.TagIdsForFile(i),
			Note:         note,
		}
	}

	return resolved, configErr, nil
}

// resolveQuickScanDefaultPaidBy is who paid when a scan does not say: the member the household named as its
// default, else the person scanning.
func resolveQuickScanDefaultPaidBy(settings models.GroupReceiptSettings, uploaderUserId uint) uint {
	if settings.QuickScanDefaultPaidByType == models.QUICK_SCAN_PAID_BY_USER &&
		settings.QuickScanDefaultPaidById != nil && *settings.QuickScanDefaultPaidById != 0 {
		return *settings.QuickScanDefaultPaidById
	}

	return uploaderUserId
}
