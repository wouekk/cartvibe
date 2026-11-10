package models

// AppRole is an app role: Admin or User (repositories.SeedSystemRoles). The skip_default_group_creation column
// of an older database stays, unused: no role can be given that flag any more.
type AppRole struct {
	BaseModel
	Name        string              `gorm:"not null;size:64;uniqueIndex" json:"name"`
	Description string              `json:"description"`
	IsDefault   bool                `gorm:"not null;default:false" json:"isDefault"`
	IsSystem    bool                `gorm:"not null;default:false" json:"isSystem"`
	Permissions []AppRolePermission `gorm:"foreignKey:AppRoleID;constraint:OnDelete:CASCADE" json:"permissions"`
}
