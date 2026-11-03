package models

import "time"

// The states of a household import. Plain strings on the contract (a new one is not a breaking
// change for older clients).
const (
	BackupImportPreviewed = "previewed"
	BackupImportQueued    = "queued"
	BackupImportRunning   = "running"
	BackupImportSucceeded = "succeeded"
	BackupImportFailed    = "failed"
)

// BackupImportJob is one household import: uploaded and previewed, then queued on the clean-up
// queue and run once. The uploaded ZIP lives at backups/<id>.zip, a path the server builds from the
// id; nothing about the file comes back from a payload.
type BackupImportJob struct {
	BaseModel
	Status        string `gorm:"type:varchar(20);not null;index" json:"status"`
	Phase         string `gorm:"type:varchar(30);not null;default:''" json:"phase"`
	FileName      string `gorm:"type:varchar(255);not null;default:''" json:"fileName"`
	FileSize      int64  `gorm:"not null;default:0" json:"fileSize"`
	ExportId      string `gorm:"type:varchar(40);not null;default:''" json:"exportId"`
	FormatVersion int    `gorm:"not null;default:0" json:"formatVersion"`
	// MeSourceUserId is the person in the file who is the importing admin; their rows become the
	// importer's own.
	MeSourceUserId *uint `json:"meSourceUserId"`
	// Summary is the JSON list of rows imported per table, written when the job succeeds.
	Summary   string     `gorm:"type:text;not null;default:''" json:"-"`
	Error     string     `gorm:"type:varchar(1000);not null;default:''" json:"error"`
	ClaimedAt *time.Time `json:"-"`
	StartedAt *time.Time `json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt"`
}
