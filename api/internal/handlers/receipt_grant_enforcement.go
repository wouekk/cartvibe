package handlers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/services"
)

// enforceReceiptGrantSelection checks a receipt upsert command against the
// caller's category/tag grants for the group: every EXISTING category/tag id
// (receipt-level and item-level) must be within the allowed set, and any NEW
// (by-name) category/tag requires the matching app create permission. It returns
// (allowed, denyMessage, error); when allowed is false the caller should respond
// 403 with denyMessage.
func enforceReceiptGrantSelection(userId uint, groupId uint, command commands.UpsertReceiptCommand) (bool, string, error) {
	permissionService := services.NewPermissionService(nil)

	categoryIds, tagIds, hasNewCategory, hasNewTag := collectReceiptSelection(command)

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

	ok, err := permissionService.ValidateCategoryTagSelection(userId, groupId, categoryIds, tagIds)
	if err != nil {
		return false, "", err
	}
	if !ok {
		return false, "You do not have access to one or more selected categories or tags", nil
	}

	return true, "", nil
}

// enforceReceiptMemberVisibilitySelection checks that every user id a receipt upsert
// plants — the payer (paidByUserId) — is within the creator's member-visible set FOR
// THE RECEIPT'S GROUP, so an isolated member cannot attach a user they may not see in
// that group (which would leak that user's presence, or hand them a receipt). It mirrors enforceReceiptGrantSelection:
// returns (allowed, denyMessage, error), and the caller responds 403 with denyMessage
// when not allowed. No-op when the creator is unrestricted in that group.
func enforceReceiptMemberVisibilitySelection(userId uint, groupId uint, command commands.UpsertReceiptCommand) (bool, string, error) {
	permissionService := services.NewPermissionService(nil)

	ok, err := permissionService.ValidateReceiptUserSelection(userId, groupId, command.PaidByUserID)
	if err != nil {
		return false, "", err
	}
	if !ok {
		return false, "You do not have access to one or more selected users", nil
	}

	return true, "", nil
}

// enforceQuickScanGrantSelection checks a quick-scan command's per-file category/tag
// picks against the caller's grants for each file's group. Quick scan creates receipts
// through the service layer (bypassing enforceReceiptGrantSelection on the receipt-upsert
// path), so this is the synchronous grant gate — the caller responds 403 with denyMessage
// when a pick is outside the caller's grants. Quick-scan pickers are id-only (no new-by-name
// category/tag), so no create-permission check is needed. It returns (allowed, denyMessage, error).
func enforceQuickScanGrantSelection(userId uint, command commands.QuickScanCommand) (bool, string, error) {
	permissionService := services.NewPermissionService(nil)

	for i := 0; i < len(command.GroupIds); i++ {
		categoryIds := command.CategoryIdsForFile(i)
		tagIds := command.TagIdsForFile(i)

		ok, err := permissionService.ValidateCategoryTagSelection(userId, command.GroupIds[i], categoryIds, tagIds)
		if err != nil {
			return false, "", err
		}
		if !ok {
			return false, "You do not have access to one or more selected categories or tags", nil
		}
	}

	return true, "", nil
}

// collectReceiptSelection walks a receipt command (receipt-level, item-level, and
// linked-item-level) and returns the existing category/tag ids referenced plus
// whether any new-by-name category/tag is present.
func collectReceiptSelection(command commands.UpsertReceiptCommand) (categoryIds []uint, tagIds []uint, hasNewCategory bool, hasNewTag bool) {
	addCategories := func(categories []commands.UpsertCategoryCommand) {
		for _, category := range categories {
			if category.Id != nil && *category.Id != 0 {
				categoryIds = append(categoryIds, *category.Id)
			} else {
				hasNewCategory = true
			}
		}
	}

	addTags := func(tags []commands.UpsertTagCommand) {
		for _, tag := range tags {
			if tag.Id != nil && *tag.Id != 0 {
				tagIds = append(tagIds, *tag.Id)
			} else {
				hasNewTag = true
			}
		}
	}

	addCategories(command.Categories)
	addTags(command.Tags)

	return categoryIds, tagIds, hasNewCategory, hasNewTag
}
