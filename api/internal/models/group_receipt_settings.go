package models

// GroupReceiptSettings is what a household set for its receipts: what the receipt form leaves out, and what Quick
// Scan asks for beside the photo.
//
// Quick Scan asks for nothing by default: photo, done (2026-11, audit D7). Each switch below adds one field to
// its dialog; none of them is ever required, and what is not asked for gets a value by itself (paid by: the
// household's default, else the person scanning; status: the household's default, else "To check").
//
// Three things here are older than that and stay as they are in the database:
//   - The columns keep their names: hide_comments and quick_scan_comment_enabled are the note's switches, from
//     when a receipt had a thread of comments.
//   - The two tags that say `default:true` are the columns' defaults in every existing database. Changing a
//     default makes the migrator rebuild the table, so the tags stay. The ORM gives a false field its column
//     default on insert, so every insert goes through repositories.CreateGroupReceiptSettingsAsGiven.
//   - Five quick_scan_*_required columns exist in older databases and are no longer read.
type GroupReceiptSettings struct {
	BaseModel
	GroupId               uint `gorm:"not null;unique" json:"groupId"`
	HideImages            bool `gorm:"not null;default:false" json:"hideImages"`
	HideReceiptCategories bool `gorm:"not null;default:false" json:"hideReceiptCategories"`
	HideReceiptTags       bool `gorm:"not null;default:false" json:"hideReceiptTags"`
	// HideNote takes the note off the household's receipts: the form, the list and Quick Scan.
	HideNote bool `gorm:"column:hide_comments;not null;default:false" json:"hideNote"`

	QuickScanPaidByEnabled     bool                       `gorm:"not null;default:true" json:"quickScanPaidByEnabled"`
	QuickScanDefaultPaidByType QuickScanDefaultPaidByType `json:"quickScanDefaultPaidByType"`
	QuickScanDefaultPaidById   *uint                      `json:"quickScanDefaultPaidById"`

	QuickScanStatusEnabled bool          `gorm:"not null;default:true" json:"quickScanStatusEnabled"`
	QuickScanDefaultStatus ReceiptStatus `json:"quickScanDefaultStatus"`

	QuickScanCategoriesEnabled bool `gorm:"not null;default:false" json:"quickScanCategoriesEnabled"`
	QuickScanTagsEnabled       bool `gorm:"not null;default:false" json:"quickScanTagsEnabled"`
	QuickScanNoteEnabled       bool `gorm:"column:quick_scan_comment_enabled;not null;default:false" json:"quickScanNoteEnabled"`
}

// IsQuickScanNoteShown reports whether Quick Scan asks for a note. HideNote hides the note for the whole
// household, so it wins over the Quick Scan switch without changing it: the switch applies again when HideNote
// is turned off.
func (settings GroupReceiptSettings) IsQuickScanNoteShown() bool {
	return settings.QuickScanNoteEnabled && !settings.HideNote
}
