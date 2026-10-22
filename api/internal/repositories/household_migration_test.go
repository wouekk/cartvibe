package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

// An install made before Phase 3 M5: every account has its own "My Receipts" group.
func seedPersonalGroupInstall(t *testing.T) (first models.User, second models.User, third models.User) {
	t.Helper()
	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureDefaultRoles(); err != nil {
		t.Fatal(err)
	}

	users := NewUserRepository(nil)
	var err error
	first, err = users.CreateUser(commands.SignUpCommand{Username: "first", DisplayName: "f", Password: "a really secure password"})
	if err != nil {
		t.Fatal(err)
	}
	// Undo M5 for the test: give the first account the old group name and later accounts their own group.
	GetDB().Model(&models.Group{}).Where("name = ?", HouseholdGroupName).Update("name", "My Receipts")

	for _, name := range []string{"second", "third"} {
		user := models.User{Username: name, DisplayName: name, Password: "x"}
		GetDB().Create(&user)
		group := models.Group{Name: "My Receipts", IsDefaultGroup: true}
		GetDB().Create(&group)
		GetDB().Create(&models.GroupMember{UserID: user.ID, GroupID: group.ID})
		if name == "second" {
			second = user
		} else {
			third = user
		}
	}
	return first, second, third
}

func TestAdoptHouseholdGroupRenamesTheFirstGroupAndMovesEmptyAccountsIn(t *testing.T) {
	defer TruncateTestDb()
	first, second, third := seedPersonalGroupInstall(t)

	// The third account already has a receipt of its own, so it stays where it is.
	var thirdGroup models.Group
	GetDB().Table("groups").Select("groups.*").Joins("JOIN group_members ON group_members.group_id = groups.id").
		Where("group_members.user_id = ?", third.ID).First(&thirdGroup)
	GetDB().Create(&models.Receipt{Name: "mine", Amount: decimal.RequireFromString("1"), Date: time.Now(), PaidByUserID: third.ID, GroupId: thirdGroup.ID, Status: models.OPEN})

	if err := adoptHouseholdGroup(GetDB()); err != nil {
		t.Fatal(err)
	}

	var household models.Group
	if err := GetDB().Where("name = ?", HouseholdGroupName).First(&household).Error; err != nil {
		t.Fatalf("expected the first group to be renamed to Household: %v", err)
	}
	var members []models.GroupMember
	GetDB().Where("group_id = ?", household.ID).Find(&members)
	ids := map[uint]bool{}
	for _, member := range members {
		ids[member.UserID] = true
	}
	if !ids[first.ID] || !ids[second.ID] || ids[third.ID] {
		t.Errorf("expected first and second in the Household, not third: %v", ids)
	}

	// Running it again changes nothing.
	if err := adoptHouseholdGroup(GetDB()); err != nil {
		t.Fatal(err)
	}
	var count int64
	GetDB().Model(&models.GroupMember{}).Where("group_id = ?", household.ID).Count(&count)
	if count != 2 {
		t.Errorf("a second run should add nobody, got %d members", count)
	}
}

func TestAdoptHouseholdGroupLeavesAnInstallWithAHouseholdAlone(t *testing.T) {
	defer TruncateTestDb()
	seedPersonalGroupInstall(t)
	GetDB().Create(&models.Group{Name: HouseholdGroupName})

	if err := adoptHouseholdGroup(GetDB()); err != nil {
		t.Fatal(err)
	}

	var personal int64
	GetDB().Model(&models.Group{}).Where("name = ?", "My Receipts").Count(&personal)
	if personal != 3 {
		t.Errorf("no group should be renamed, got %d personal groups", personal)
	}
}
