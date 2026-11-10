package structs

import (
	"cartvibe/api/internal/models"
	"time"
)

type Activity struct {
	Id                     uint                    `json:"id"`
	Type                   models.SystemTaskType   `json:"type"`
	Status                 models.SystemTaskStatus `json:"status"`
	StartedAt              time.Time               `json:"startedAt"`
	EndedAt                *time.Time              `json:"endedAt"`
	RanByUserId            *uint                   `json:"ranByUserId"`
	ReceiptId              *uint                   `json:"receiptId"`
	GroupId                *uint                   `json:"groupId"`
	CanBeRestarted         bool                    `json:"canBeRestarted"`
	HasSourceFile          bool                    `json:"hasSourceFile"`
	AssociatedSystemTaskId *uint                   `json:"-"`
	// JobId names the job behind the activity (models.Job), so the flags above can be
	// resolved. It is internal and kept off the wire.
	JobId string `json:"-"`
}
