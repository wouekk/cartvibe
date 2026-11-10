package permissions

// The two everyday roles: User in the app and Member in a household. With Admin and
// Owner (legacy.go), they are the whole fixed set (2026-11). These lists are the
// roles: repositories.SeedSystemRoles writes exactly these keys on every start, so a
// key added here reaches every User or Member at the next start, and one removed
// here is taken away.

// FamilyUserAppKeys is what a family member may do outside a group: keep their account and
// preferences, read notifications, search receipts, manage the shared categories and tags
// the AI fills in (so a wrong pick can be fixed in one place), and set the AI up. Not users, roles, system
// settings, groups or reports: those stay with the Admin. The Dashboard is the
// family's report (decided 2026-10-20), so a User gets no report permissions.
func FamilyUserAppKeys() []string {
	return []string{
		AppAccountRead,
		AppAccountUpdate,
		AppUserPreferencesRead,
		AppUserPreferencesUpdate,
		AppNotificationsRead,
		AppNotificationsDelete,
		AppReceiptsSearch,
		// The AI page: any member can set the AI up and test it (the first settings are linked server-side).
		AppReceiptProcessingSettingsCreate,
		AppReceiptProcessingSettingsRead,
		AppReceiptProcessingSettingsUpdate,
		AppCategoriesCreate,
		AppCategoriesRead,
		AppCategoriesUpdate,
		AppCategoriesDelete,
		AppTagsCreate,
		AppTagsRead,
		AppTagsUpdate,
		AppTagsDelete,
	}
}

// FamilyMemberGroupKeys is what a family member may do in the household group: everything with
// receipts (deleting included), shopping lists, comments and the activity log.
// Not reports (see FamilyUserAppKeys), nor the group's settings, members or deletion.
func FamilyMemberGroupKeys() []string {
	return []string{
		GroupView,
		GroupReceiptsRead,
		GroupReceiptsCreate,
		GroupReceiptsUpdate,
		GroupReceiptsDelete,
		GroupReceiptsDuplicate,
		GroupReceiptsQuickScan,
		GroupReceiptsMagicFill,
		GroupCommentsCreate,
		GroupCommentsDelete,
		GroupActivitiesRead,
		GroupActivitiesRerun,
		GroupShoppingListsCreate,
		GroupShoppingListsRead,
		GroupShoppingListsUpdate,
		GroupShoppingListsDelete,
	}
}
