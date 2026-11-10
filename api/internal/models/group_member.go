package models

import "time"

// GroupMember puts a person in a household with one of its two roles. The grant flags a membership once
// carried (category_grants_restricted, tag_grants_restricted) stay in a database that had them, unused.
type GroupMember struct {
	CreatedAt           time.Time            `json:"createdAt"`
	UpdatedAt           time.Time            `json:"updatedAt"`
	UserID              uint                 `gorm:"primaryKey;autoIncrement:false" json:"userId"`
	GroupID             uint                 `gorm:"primaryKey;autoIncrement:false" json:"groupId"`
	GroupRoleID         *uint                `gorm:"index" json:"groupRoleId"`
	GroupRoleDefinition *GroupRoleDefinition `gorm:"foreignKey:GroupRoleID;references:ID;constraint:OnDelete:RESTRICT" json:"groupRoleDefinition,omitempty"`
}
