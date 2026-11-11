package services

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"testing"
)

// The households the service tests share. Everyone in a household sees all of it, so a fixture is a
// group, a role and the people on it.

// seedHouseholdMember creates a household, a group role holding group.receipts.read, and a member on
// it. Returns the user id, group id, and role id.
func seedHouseholdMember(t *testing.T, username string) (uint, uint, uint) {
	t.Helper()
	db := repositories.GetDB()

	group := models.Group{Name: "household-" + username}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}

	role, err := repositories.NewRoleRepository(nil).CreateGroupRole("Reader "+username, "", []string{permissions.GroupReceiptsRead})
	if err != nil {
		t.Fatalf("seed group role: %v", err)
	}

	user := models.User{Username: username, Password: "password"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}

	seedHouseholdMembership(t, group.ID, user.ID, &role.ID)

	return user.ID, group.ID, role.ID
}

func seedHouseholdMembership(t *testing.T, groupId uint, userId uint, roleId *uint) {
	t.Helper()
	member := models.GroupMember{GroupID: groupId, UserID: userId, GroupRoleID: roleId}
	if err := repositories.GetDB().Create(&member).Error; err != nil {
		t.Fatalf("seed member: %v", err)
	}
}

func seedUser(t *testing.T, username string) models.User {
	t.Helper()
	user := models.User{Username: username, Password: "password"}
	if err := repositories.GetDB().Create(&user).Error; err != nil {
		t.Fatalf("seed user %s: %v", username, err)
	}
	return user
}

func makeUser(t *testing.T, username string) uint {
	t.Helper()
	return seedUser(t, username).ID
}

func makeCategory(t *testing.T, name string) uint {
	t.Helper()
	category := models.Category{Name: name}
	if err := repositories.GetDB().Create(&category).Error; err != nil {
		t.Fatalf("seed category: %v", err)
	}
	return category.ID
}

func makeTag(t *testing.T, name string) uint {
	t.Helper()
	tag := models.Tag{Name: name}
	if err := repositories.GetDB().Create(&tag).Error; err != nil {
		t.Fatalf("seed tag: %v", err)
	}
	return tag.ID
}

// householdFixture is one household with three people who may read its receipts: its owner and two
// members.
type householdFixture struct {
	groupId      uint
	ownerId      uint
	memberAId    uint
	memberBId    uint
	memberRoleId uint
	ownerRoleId  uint
}

func seedHousehold(t *testing.T) householdFixture {
	t.Helper()
	db := repositories.GetDB()
	roleRepository := repositories.NewRoleRepository(nil)

	group := models.Group{Name: "fixture-household"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}

	ownerRole, err := roleRepository.CreateGroupRole("Fixture Owner", "", []string{permissions.GroupReceiptsRead})
	if err != nil {
		t.Fatalf("seed owner role: %v", err)
	}
	memberRole, err := roleRepository.CreateGroupRole("Fixture Member", "", []string{permissions.GroupReceiptsRead})
	if err != nil {
		t.Fatalf("seed member role: %v", err)
	}

	owner := makeUser(t, "fixture-owner")
	a := makeUser(t, "fixture-member-a")
	b := makeUser(t, "fixture-member-b")

	seedHouseholdMembership(t, group.ID, owner, &ownerRole.ID)
	seedHouseholdMembership(t, group.ID, a, &memberRole.ID)
	seedHouseholdMembership(t, group.ID, b, &memberRole.ID)

	return householdFixture{
		groupId:      group.ID,
		ownerId:      owner,
		memberAId:    a,
		memberBId:    b,
		memberRoleId: memberRole.ID,
		ownerRoleId:  ownerRole.ID,
	}
}
