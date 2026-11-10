package models

import "time"

// JobStatus is where a queued job stands. A job that succeeded has no status: its row is deleted.
type JobStatus string

const (
	// JobPending waits for its turn, or for NextAttemptAt after a failed try.
	JobPending JobStatus = "PENDING"
	// JobRunning is being worked on by this process.
	JobRunning JobStatus = "RUNNING"
	// JobFailed has used up its tries (or failed in a way a retry cannot fix). It stays until its upload is swept,
	// so the activity that shows it can hand the file back or run it again.
	JobFailed JobStatus = "FAILED"
)

// Job is one piece of background work a request started: a quick scan, a household import. The queue is this
// table (internal/jobs): a row is claimed with a conditional UPDATE, tried up to MaxAttempts times, and deleted
// once it succeeds. Periodic work (the sweeps) is not a job; it runs on timers.
//
// Kind is the handler's name, a plain string. Payload is the handler's own JSON.
type Job struct {
	ID            uint      `gorm:"primarykey" json:"id"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	Kind          string    `gorm:"not null;index:idx_jobs_kind" json:"kind"`
	Payload       string    `gorm:"type:text" json:"-"`
	Status        JobStatus `gorm:"not null;index:idx_jobs_due,priority:1" json:"status"`
	NextAttemptAt time.Time `gorm:"not null;index:idx_jobs_due,priority:2" json:"nextAttemptAt"`
	Attempts      int       `gorm:"not null;default:0" json:"attempts"`
	MaxAttempts   int       `gorm:"not null;default:1" json:"maxAttempts"`
	LastError     string    `gorm:"type:text" json:"lastError"`
}
