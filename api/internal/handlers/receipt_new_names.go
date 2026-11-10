package handlers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/services"
)

// enforceNewCategoryTagPermission checks the one thing a receipt's categories
// and tags still need a permission for: a NEW one, sent by name instead of by
// id, creates a row in the shared catalog, so it needs the matching app create
// permission. Every existing category and tag may be picked by anyone who may
// write the receipt (the per-role and per-member grants went with fixed roles,
// 2026-11). It returns (allowed, denyMessage, error); when allowed is false the
// caller responds 403 with denyMessage.
func enforceNewCategoryTagPermission(userId uint, command commands.UpsertReceiptCommand) (bool, string, error) {
	permissionService := services.NewPermissionService(nil)

	hasNewCategory, hasNewTag := receiptNamesNewCategoryOrTag(command)

	if hasNewCategory {
		ok, err := permissionService.HasAppPermissions(userId, permissions.AppCategoriesCreate)
		if err != nil {
			return false, "", err
		}
		if !ok {
			return false, "You do not have permission to create new categories", nil
		}
	}

	if hasNewTag {
		ok, err := permissionService.HasAppPermissions(userId, permissions.AppTagsCreate)
		if err != nil {
			return false, "", err
		}
		if !ok {
			return false, "You do not have permission to create new tags", nil
		}
	}

	return true, "", nil
}

// receiptNamesNewCategoryOrTag reports whether a receipt command carries a
// category or a tag without an id, which the upsert creates by name.
func receiptNamesNewCategoryOrTag(command commands.UpsertReceiptCommand) (hasNewCategory bool, hasNewTag bool) {
	for _, category := range command.Categories {
		if category.Id == nil || *category.Id == 0 {
			hasNewCategory = true
		}
	}

	for _, tag := range command.Tags {
		if tag.Id == nil || *tag.Id == 0 {
			hasNewTag = true
		}
	}

	return hasNewCategory, hasNewTag
}
