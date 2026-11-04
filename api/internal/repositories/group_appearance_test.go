package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"testing"
)

func lookOf(t *testing.T, id uint) (string, string) {
	t.Helper()
	var group models.Group
	if err := GetDB().First(&group, id).Error; err != nil {
		t.Fatal(err)
	}
	return group.Icon, group.Color
}

func TestGroupLook_CreateUpdateKeepAndClear(t *testing.T) {
	defer TruncateTestDb()
	CreateTestUser()
	icon, color := "dog", "teal"
	created, err := setupGroupRepository().CreateGroup(commands.UpsertGroupCommand{Name: "Pets", Status: models.GROUP_ACTIVE, Icon: &icon, Color: &color}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if gotIcon, gotColor := lookOf(t, created.ID); gotIcon != "dog" || gotColor != "teal" {
		utils.PrintTestError(t, gotIcon+"/"+gotColor, "dog/teal")
	}

	members := []commands.UpsertGroupMemberCommand{{UserID: 1, GroupID: created.ID}}
	id := utils.UintToString(created.ID)

	// An older client that sends neither field keeps the look.
	if _, err := setupGroupRepository().UpdateGroup(commands.UpsertGroupCommand{Name: "Pets", Status: models.GROUP_ACTIVE, GroupMembers: members}, id); err != nil {
		t.Fatal(err)
	}
	if gotIcon, gotColor := lookOf(t, created.ID); gotIcon != "dog" || gotColor != "teal" {
		utils.PrintTestError(t, gotIcon+"/"+gotColor, "dog/teal (kept)")
	}

	// "" goes back to the default look.
	empty, pink := "", "pink"
	if _, err := setupGroupRepository().UpdateGroup(commands.UpsertGroupCommand{Name: "Pets", Status: models.GROUP_ACTIVE, GroupMembers: members, Icon: &empty, Color: &pink}, id); err != nil {
		t.Fatal(err)
	}
	if gotIcon, gotColor := lookOf(t, created.ID); gotIcon != "" || gotColor != "pink" {
		utils.PrintTestError(t, gotIcon+"/"+gotColor, "/pink")
	}
}

func TestGroupLook_NeverOnTheAllGroup(t *testing.T) {
	defer TruncateTestDb()
	CreateTestUser()
	icon, color := "home", "red"
	all, err := setupGroupRepository().CreateGroup(commands.UpsertGroupCommand{Name: "All", Status: models.GROUP_ACTIVE, IsAllGroup: true, Icon: &icon, Color: &color}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if gotIcon, gotColor := lookOf(t, all.ID); gotIcon != "" || gotColor != "" {
		utils.PrintTestError(t, gotIcon+"/"+gotColor, "/")
	}
}
