package permissions

import "slices"

// Family role permission sets (Phase 3 M4). The app offers two roles: Admin (the seeded Legacy
// Admin app role and Legacy Owner group role, which hold everything) and User — these sets. Like
// the legacy sets they are fixed: a permission added to the registry later reaches a family User
// only when it is listed here.

// FamilyUserAppKeys is what a family member may do outside a group: keep their account and
// preferences, read notifications, search receipts, manage the shared categories, tags and custom
// fields the AI fills in (so a wrong pick can be fixed in one place), and use the ready-made
// reports. Not users, roles, system settings, the AI page, groups or the report builder: those
// stay with the Admin.
func FamilyUserAppKeys() []string {
	return []string{
		AppAccountRead,
		AppAccountUpdate,
		AppUserPreferencesRead,
		AppUserPreferencesUpdate,
		AppNotificationsRead,
		AppNotificationsDelete,
		AppReceiptsSearch,
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
		AppReportsRead,
		AppReportsGenerate,
	}
}

// FamilyMemberGroupKeys is what a family member may do in the household group: everything with
// receipts (deleting included), shopping lists, comments, dashboards and reports — the legacy
// editor set plus group reports. Not the group's settings, members or deletion.
func FamilyMemberGroupKeys() []string {
	return slices.Concat(LegacyGroupEditorKeys(), []string{GroupReportsRead})
}
