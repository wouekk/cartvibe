package repositories

import (
	"receipt-wrangler/api/internal/models"

	"gorm.io/gorm"
)

const adoptHouseholdGroupMigration = "adopt-household-group-2026-10"

// adoptHouseholdGroup brings an install that predates Phase 3 M5 to the one-Household model, once:
// when no group is named Household, the first account's personal "My Receipts" group is renamed to it,
// and every other account whose own personal group holds no receipts joins it as a Member. Their empty
// personal groups are left for an administrator to remove (Manage Households); nothing is deleted.
// An install that already has a Household, or no first-account personal group, is left alone.
func adoptHouseholdGroup(tx *gorm.DB) error {
	var existing int64
	err := tx.Model(&models.Group{}).Where("name = ?", HouseholdGroupName).Count(&existing).Error
	if err != nil || existing > 0 {
		return err
	}

	var firstUser models.User
	found := tx.Order("id").Limit(1).Find(&firstUser)
	if found.Error != nil || found.RowsAffected == 0 {
		return found.Error
	}

	var household models.Group
	err = tx.Table("groups").Select("groups.*").
		Joins("JOIN group_members ON group_members.group_id = groups.id").
		Where("group_members.user_id = ? AND groups.name = ? AND (groups.is_all_group IS NULL OR groups.is_all_group = ?)", firstUser.ID, "My Receipts", false).
		Order("groups.id").Limit(1).Find(&household).Error
	if err != nil || household.ID == 0 {
		return err
	}

	err = tx.Model(&models.Group{}).Where("id = ?", household.ID).Update("name", HouseholdGroupName).Error
	if err != nil {
		return err
	}

	roleRepository := NewRoleRepository(tx)
	memberRoleId, err := roleRepository.GetGroupRoleIdByName(FamilyMemberRoleName)
	if err != nil {
		return err
	}
	if memberRoleId == nil {
		memberRoleId, err = roleRepository.GetDefaultGroupRoleId()
		if err != nil {
			return err
		}
	}

	var others []models.User
	err = tx.Where("id <> ?", firstUser.ID).Find(&others).Error
	if err != nil {
		return err
	}

	for _, user := range others {
		var personal models.Group
		err = tx.Table("groups").Select("groups.*").Select("groups.*").
			Joins("JOIN group_members ON group_members.group_id = groups.id").
			Where("group_members.user_id = ? AND groups.name = ? AND (groups.is_all_group IS NULL OR groups.is_all_group = ?)", user.ID, "My Receipts", false).
			Order("groups.id").Limit(1).Find(&personal).Error
		if err != nil {
			return err
		}

		// Someone with their own receipts keeps them where they are; an administrator can move them.
		if personal.ID != 0 {
			var receiptCount int64
			err = tx.Model(&models.Receipt{}).Where("group_id = ?", personal.ID).Count(&receiptCount).Error
			if err != nil {
				return err
			}
			if receiptCount > 0 {
				continue
			}
		}

		var already int64
		err = tx.Model(&models.GroupMember{}).Where("group_id = ? AND user_id = ?", household.ID, user.ID).Count(&already).Error
		if err != nil {
			return err
		}
		if already > 0 {
			continue
		}

		err = tx.Create(&models.GroupMember{UserID: user.ID, GroupID: household.ID, GroupRoleID: memberRoleId}).Error
		if err != nil {
			return err
		}
	}

	return nil
}
