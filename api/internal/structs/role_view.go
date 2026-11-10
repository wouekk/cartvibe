package structs

import "cartvibe/api/internal/permissions"

// RoleView is one of the fixed roles as the people pages read it: its id to
// assign, its scope, and the permission keys it holds.
type RoleView struct {
	Id            uint              `json:"id"`
	Name          string            `json:"name"`
	Description   string            `json:"description"`
	Scope         permissions.Scope `json:"scope"`
	IsDefault     bool              `json:"isDefault"`
	IsSystem      bool              `json:"isSystem"`
	Permissions   []string          `json:"permissions"`
	AssignedCount int               `json:"assignedCount"`
}
