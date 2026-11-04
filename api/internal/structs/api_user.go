package structs

import (
	"time"
)

type UserView struct {
	CreatedAt          time.Time `json:"createdAt"`
	DefaultAvatarColor string    `json:"defaultAvatarColor"`
	DisplayName        string    `json:"displayName"`
	ID                 uint      `json:"id"`
	IsDummyUser        bool      `json:"isDummyUser"`
	UpdatedAt          time.Time `json:"updatedAt"`
	Username           string    `json:"username"`
	AppRoleID          *uint     `json:"appRoleId"`
	// AvatarUpdatedAt is set while the person has an avatar photo (GET /user/{id}/avatar); nil shows the initials.
	AvatarUpdatedAt *time.Time `json:"avatarUpdatedAt"`
}
