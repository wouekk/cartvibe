package models

// PushSubscription is one browser that agreed to receive Web Push for a person (the PushSubscription a
// service worker hands out). The endpoint is the push service's URL for that browser; P256dh and Auth are the
// keys the payload is encrypted with.
type PushSubscription struct {
	BaseModel
	UserId   uint   `gorm:"not null;index" json:"userId"`
	Endpoint string `gorm:"size:1024;not null;uniqueIndex" json:"endpoint"`
	P256dh   string `gorm:"size:200;not null" json:"-"`
	Auth     string `gorm:"size:100;not null" json:"-"`
}
