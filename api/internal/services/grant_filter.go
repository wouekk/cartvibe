package services

import (
	"cartvibe/api/internal/repositories"
)

// GroupPermissionResolver returns a resolver that reports whether userId holds
// the given group permission in a group. The receipt repository uses it to gate
// the synthetic All-group expansion per group without importing the service
// layer. Callers pass the permission their direct single-group path requires.
//
// This is the one visibility rule left since roles became fixed (2026-11): a person sees a household's receipts
// when they are a member of it, and all of them. The category and tag grants, paid-by visibility and member
// isolation that used to narrow that are gone.
func (service PermissionService) GroupPermissionResolver(userId uint, permission string) repositories.GroupReadableResolver {
	return func(groupId uint) (bool, error) {
		return service.HasGroupPermissions(userId, groupId, permission)
	}
}
