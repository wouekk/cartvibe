package models

import "time"

// User in the system
//
// swagger:model
type User struct {
	BaseModel
	DefaultAvatarColor string     `json:"defaultAvatarColor" gorm:"default:'#27b1ff'"`
	DisplayName        string     `json:"displayName"`
	IsDummyUser        bool       `json:"isDummyUser"`
	Password           string     `gorm:"not null"`
	Username           string     `gorm:"not null; uniqueIndex"`
	LastLoginDate      *time.Time `json:"lastLoginDate"`
	// AvatarUpdatedAt is when the person last uploaded a photo for their avatar; nil when they have none and the
	// initials show. It also versions the photo's address, so a new photo is not served from the browser cache.
	AvatarUpdatedAt *time.Time `json:"avatarUpdatedAt"`
	AppRoleID          *uint      `gorm:"index" json:"appRoleId"`
	AppRole            *AppRole   `gorm:"foreignKey:AppRoleID;constraint:OnDelete:RESTRICT" json:"appRole,omitempty"`
}
