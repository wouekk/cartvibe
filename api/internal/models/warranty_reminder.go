package models

// WarrantyReminder is one person's planned reminder that a receipt's warranty ends. There is at most one per
// person and receipt (Key "warranty-<receiptId>"), so rescheduling replaces it. FireOn and WarrantyUntil are
// calendar days ("2028-09-29"). FiredFor is the WarrantyUntil the reminder has fired for: a later sweep or a
// re-save of the same date never fires it again, a new date does.
type WarrantyReminder struct {
	BaseModel
	UserId        uint    `gorm:"not null;uniqueIndex:idx_warranty_reminder_user_key,priority:1" json:"userId"`
	Key           string  `gorm:"size:40;not null;uniqueIndex:idx_warranty_reminder_user_key,priority:2" json:"key"`
	ReceiptId     uint    `gorm:"not null;index" json:"receiptId"`
	WarrantyUntil string  `gorm:"size:10;not null" json:"warrantyUntil"`
	FireOn        string  `gorm:"size:10;not null;index" json:"fireOn"`
	FiredFor      *string `gorm:"size:10" json:"firedFor"`
}
