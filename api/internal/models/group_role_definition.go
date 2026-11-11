package models

import "time"

// GroupRoleDefinition is a household role: Owner or Member (repositories.SeedSystemRoles). It is a name and
// a list of permission keys. The columns that once narrowed what a member saw (paid-by, isolation, required
// fields, per-member grants) stay in a database that had them, unused.
type GroupRoleDefinition struct {
	ID              uint      `gorm:"primarykey" json:"id"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
	CreatedBy       *uint     `json:"createdBy"`
	CreatedByString string    `json:"createdByString"`

	Name        string `gorm:"not null;size:64;uniqueIndex" json:"name"`
	Description string `json:"description"`
	IsDefault   bool   `gorm:"not null;default:false" json:"isDefault"`
	IsSystem    bool   `gorm:"not null;default:false" json:"isSystem"`

	Permissions []GroupRolePermission `gorm:"foreignKey:GroupRoleID;constraint:OnDelete:CASCADE" json:"permissions"`
}
