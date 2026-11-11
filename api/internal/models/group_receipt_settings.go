package models

// GroupReceiptSettings is what a household set for its receipts: what the receipt form leaves out, and the
// little that Quick Scan can be told.
//
// A Quick Scan is a photo and nothing else (2026-11, audit D7). The person scanning paid, the receipt starts as
// "To check", and its categories and tags come from its product lines once they are read. A household can ask
// for one more thing, a note, and can change the two defaults a scan (or a shopping-trip photo) falls back on.
//
// Older than that, and left as they are in the database:
//   - The note's two columns keep their names from when a receipt had a thread of comments: hide_comments and
//     quick_scan_comment_enabled.
//   - Nine quick_scan_* columns of the upstream settings matrix (a "show" and a "require" switch per field) exist
//     in databases made before this release. Nothing reads them; each has a column default, so inserts still work.
type GroupReceiptSettings struct {
	BaseModel
	GroupId               uint `gorm:"not null;unique" json:"groupId"`
	HideImages            bool `gorm:"not null;default:false" json:"hideImages"`
	HideReceiptCategories bool `gorm:"not null;default:false" json:"hideReceiptCategories"`
	HideReceiptTags       bool `gorm:"not null;default:false" json:"hideReceiptTags"`
	// HideNote takes the note off the household's receipts: the form, the list and Quick Scan.
	HideNote bool `gorm:"column:hide_comments;not null;default:false" json:"hideNote"`

	// QuickScanNoteEnabled adds a note field to the Quick Scan dialog. It is never required.
	QuickScanNoteEnabled bool `gorm:"column:quick_scan_comment_enabled;not null;default:false" json:"quickScanNoteEnabled"`

	// Who paid, and the status, of a scan that does not say: see ResolveQuickScanFields. Empty means the person
	// scanning and "To check".
	QuickScanDefaultPaidByType QuickScanDefaultPaidByType `json:"quickScanDefaultPaidByType"`
	QuickScanDefaultPaidById   *uint                      `json:"quickScanDefaultPaidById"`
	QuickScanDefaultStatus     ReceiptStatus              `json:"quickScanDefaultStatus"`
}

// IsQuickScanNoteShown reports whether Quick Scan asks for a note. HideNote hides the note for the whole
// household, so it wins over the Quick Scan switch without changing it: the switch applies again when HideNote
// is turned off.
func (settings GroupReceiptSettings) IsQuickScanNoteShown() bool {
	return settings.QuickScanNoteEnabled && !settings.HideNote
}
