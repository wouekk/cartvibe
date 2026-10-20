package repositories

// Names of the immutable system roles seeded by
// SeedSystemRoles. They are the shared source of truth keyed on by both the
// seeder (which is idempotent on the role Name) and the data migration that
// assigns these roles to existing users / group members.
const (
	LegacyAdminRoleName  = "Legacy Admin"
	LegacyUserRoleName   = "Legacy User"
	LegacyViewerRoleName = "Legacy Viewer"
	LegacyEditorRoleName = "Legacy Editor"
	LegacyOwnerRoleName  = "Legacy Owner"

	// The family roles (Phase 3 M4): "User" in the app and "Member" in a group. The desktop offers
	// them as "User" next to Legacy Admin / Legacy Owner shown as "Admin".
	FamilyUserRoleName   = "User"
	FamilyMemberRoleName = "Member"
)
