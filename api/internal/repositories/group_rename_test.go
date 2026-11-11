package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"path/filepath"
	"testing"
)

// seedGroupWithReceiptFile creates a group, a receipt in it and that receipt's file on disk, and returns the
// receipt id and the file's name parts so the test can find it again through BuildFilePath.
func seedGroupWithReceiptFile(t *testing.T, groupName string) (models.Group, models.Receipt) {
	t.Helper()
	CreateTestUser()
	group := models.Group{Name: groupName}
	if err := GetDB().Create(&group).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}
	member := models.GroupMember{GroupID: group.ID, UserID: 1}
	if err := GetDB().Create(&member).Error; err != nil {
		t.Fatalf("seed member: %v", err)
	}
	receipt := models.Receipt{Name: "r", GroupId: group.ID, PaidByUserID: 1}
	if err := GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}

	path, err := NewFileRepository(nil).BuildFilePath(utils.UintToString(receipt.ID), "7")
	if err != nil {
		t.Fatalf("build path: %v", err)
	}
	if err := utils.EnsureDataDirectory(filepath.Dir(path)); err != nil {
		t.Fatalf("make folder: %v", err)
	}
	if err := utils.WriteDataFile(path, []byte("receipt bytes")); err != nil {
		t.Fatalf("write file: %v", err)
	}
	return group, receipt
}

func cleanGroupFolder(t *testing.T, groupId uint) {
	t.Cleanup(func() {
		if path, err := utils.BuildGroupPathString(utils.UintToString(groupId)); err == nil {
			_ = utils.RemoveAllInDataDir(path)
		}
	})
}

func renameCommand(group models.Group, name string) commands.UpsertGroupCommand {
	return commands.UpsertGroupCommand{
		Name:         name,
		Status:       models.GROUP_ACTIVE,
		GroupMembers: []commands.UpsertGroupMemberCommand{{UserID: 1, GroupID: group.ID}},
	}
}

func readReceiptFile(t *testing.T, receipt models.Receipt) []byte {
	t.Helper()
	path, err := NewFileRepository(nil).BuildFilePath(utils.UintToString(receipt.ID), "7")
	if err != nil {
		t.Fatalf("build path: %v", err)
	}
	bytes, err := utils.ReadDataFile(path)
	if err != nil {
		t.Fatalf("receipt file not reachable after the rename: %v", err)
	}
	return bytes
}

// A household's files are in data/<id>, so a rename touches nothing on disk and can never be refused for a folder.
func TestUpdateGroup_RenameLeavesTheFilesWhereTheyAre(t *testing.T) {
	defer TruncateTestDb()
	group, receipt := seedGroupWithReceiptFile(t, "Household")
	cleanGroupFolder(t, group.ID)
	before, _ := NewFileRepository(nil).BuildFilePath(utils.UintToString(receipt.ID), "7")

	// A name that would have been a path of its own, were names still part of one.
	updated, err := setupGroupRepository().UpdateGroup(renameCommand(group, "Kowalscy & Co (2026)"), utils.UintToString(group.ID))
	if err != nil {
		t.Fatalf("rename: %v", err)
	}
	if updated.Name != "Kowalscy & Co (2026)" {
		utils.PrintTestError(t, updated.Name, "Kowalscy & Co (2026)")
	}
	if got := string(readReceiptFile(t, receipt)); got != "receipt bytes" {
		utils.PrintTestError(t, got, "receipt bytes")
	}

	after, _ := NewFileRepository(nil).BuildFilePath(utils.UintToString(receipt.ID), "7")
	if after != before {
		utils.PrintTestError(t, after, before)
	}
}

func TestUpdateGroup_RenameWithoutAFolderJustRenames(t *testing.T) {
	defer TruncateTestDb()
	CreateTestUser()
	group := models.Group{Name: "Empty"}
	GetDB().Create(&group)
	GetDB().Create(&models.GroupMember{GroupID: group.ID, UserID: 1})
	cleanGroupFolder(t, group.ID)

	updated, err := setupGroupRepository().UpdateGroup(renameCommand(group, "Still empty"), utils.UintToString(group.ID))
	if err != nil {
		t.Fatalf("rename: %v", err)
	}
	if updated.Name != "Still empty" {
		utils.PrintTestError(t, updated.Name, "Still empty")
	}
}

func TestRenamedHouseholdStillTakesInNewAccounts(t *testing.T) {
	defer TruncateTestDb()
	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureDefaultRoles(); err != nil {
		t.Fatal(err)
	}

	users := NewUserRepository(nil)
	first, err := users.CreateUser(commands.SignUpCommand{Username: "first", DisplayName: "f", Password: "a really secure password"})
	if err != nil {
		t.Fatal(err)
	}
	household, err := FindHouseholdGroup(GetDB())
	if err != nil || household.ID == 0 || !household.IsHousehold {
		t.Fatalf("the first account's group is not flagged as the household: %+v, %v", household, err)
	}
	cleanGroupFolder(t, household.ID)

	command := commands.UpsertGroupCommand{
		Name:         "Kowalscy",
		Status:       models.GROUP_ACTIVE,
		GroupMembers: []commands.UpsertGroupMemberCommand{{UserID: first.ID, GroupID: household.ID}},
	}
	if _, err := setupGroupRepository().UpdateGroup(command, utils.UintToString(household.ID)); err != nil {
		t.Fatalf("rename: %v", err)
	}

	second, err := users.CreateUser(commands.SignUpCommand{Username: "second", DisplayName: "s", Password: "a really secure password"})
	if err != nil {
		t.Fatal(err)
	}
	var joined int64
	GetDB().Model(&models.GroupMember{}).Where("group_id = ? AND user_id = ?", household.ID, second.ID).Count(&joined)
	if joined != 1 {
		utils.PrintTestError(t, joined, 1)
	}
	var personal int64
	GetDB().Model(&models.Group{}).Where("name = ?", "My Receipts").Count(&personal)
	if personal != 0 {
		utils.PrintTestError(t, personal, 0)
	}
}

func TestMarkHouseholdGroupMigrationFlagsTheOriginalHousehold(t *testing.T) {
	defer TruncateTestDb()
	GetDB().Create(&models.Group{Name: "My Receipts"})
	household := models.Group{Name: HouseholdGroupName}
	GetDB().Create(&household)

	if err := runMarkHouseholdGroupMigration(GetDB()); err != nil {
		t.Fatal(err)
	}

	found, err := FindHouseholdGroup(GetDB())
	if err != nil || found.ID != household.ID || !found.IsHousehold {
		utils.PrintTestError(t, found, household.ID)
	}
	var flagged int64
	GetDB().Model(&models.Group{}).Where("is_household = ?", true).Count(&flagged)
	if flagged != 1 {
		utils.PrintTestError(t, flagged, 1)
	}
}
