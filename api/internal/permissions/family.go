package permissions

// Family role permission sets (Phase 3 M4). The app offers two roles: Admin (the seeded Legacy
// Admin app role and Legacy Owner group role, which hold everything) and User — these sets. Like
// the legacy sets they are fixed: a permission added to the registry later reaches a family User
// only when it is listed here.

// FamilyUserAppKeys is what a family member may do outside a group: keep their account and
// preferences, read notifications, search receipts, manage the shared categories, tags and custom
// fields the AI fills in (so a wrong pick can be fixed in one place), and set the AI up. Not users, roles, system
// settings, groups or reports: those stay with the Admin. The Dashboard is the
// family's report (M6, decided 2026-10-20), so a User gets no report permissions; adding them
// later is possible, but reconciliation is add-only, so taking them away again would not be.
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
		AppCustomFieldsCreate,
		AppCustomFieldsRead,
		AppCustomFieldsUpdate,
		AppCustomFieldsDelete,
	}
}

// FamilyMemberGroupKeys is what a family member may do in the household group: everything with
// receipts (deleting included), shopping lists, comments and dashboards — the legacy editor set.
// Not reports (see FamilyUserAppKeys), nor the group's settings, members or deletion.
func FamilyMemberGroupKeys() []string {
	return LegacyGroupEditorKeys()
}
