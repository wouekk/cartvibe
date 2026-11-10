package repositories

import (
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"

	"github.com/shopspring/decimal"
)

// The All-group view must be gated by the caller's per-group read permission:
// a group whose readable resolver returns false is dropped entirely, so a member
// cannot read receipts in a group whose role denies receipt read.
func TestGetPagedReceipts_AllGroup_ReadGateDropsUnreadableGroups(t *testing.T) {
	defer TruncateTestDb()
	db := GetDB()

	group1 := models.Group{Name: "gate-g1"}
	group2 := models.Group{Name: "gate-g2"}
	allGroup := models.Group{Name: "gate-all", IsAllGroup: true}
	db.Create(&group1)
	db.Create(&group2)
	db.Create(&allGroup)

	member := models.User{Username: "gate-member", Password: "x"}
	db.Create(&member)
	db.Create(&models.GroupMember{GroupID: group1.ID, UserID: member.ID})
	db.Create(&models.GroupMember{GroupID: group2.ID, UserID: member.ID})

	mk := func(groupId uint, name string) {
		db.Create(&models.Receipt{Name: name, Amount: decimal.NewFromInt(1), Date: time.Now(), PaidByUserID: member.ID, GroupId: groupId, Status: models.OPEN})
	}
	mk(group1.ID, "g1-r1")
	mk(group2.ID, "g2-r1")

	// The caller can read group1 but NOT group2.
	readable := func(groupId uint) (bool, error) { return groupId == group1.ID, nil }

	repository := NewReceiptRepository(nil)
	receipts, count, err := repository.GetPagedReceiptsByGroupId(
		member.ID, utils.UintToString(allGroup.ID), pagedRequestAllReceipts(), nil, readable,
	)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if count != 1 || len(receipts) != 1 {
		utils.PrintTestError(t, count, 1)
		return
	}
	if receipts[0].GroupId != group1.ID {
		utils.PrintTestError(t, receipts[0].GroupId, group1.ID)
	}
}
