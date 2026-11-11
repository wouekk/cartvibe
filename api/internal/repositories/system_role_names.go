package repositories

// The names of the four fixed roles, which SeedSystemRoles is keyed on. The two
// that hold everything keep the names their rows were first seeded under; the
// app shows them as Admin (the desktop's utils/family-roles.ts shares these names).
const (
	// App roles: Admin and User.
	LegacyAdminRoleName = "Legacy Admin"
	FamilyUserRoleName  = "User"

	// Household roles: Owner and Member.
	LegacyOwnerRoleName  = "Legacy Owner"
	FamilyMemberRoleName = "Member"
)

// HouseholdGroupName is the one shared group of a family install (Phase 3 M5): the first account's
// group is called this, and every later account joins it instead of getting a personal group.
const HouseholdGroupName = "Household"
