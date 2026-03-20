package services

import (
	"errors"
	"net/http"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/utils"

	"gorm.io/gorm"
)

func DeleteUser(userId string) error {
	db := repositories.GetDB()
	uintUserId, err := utils.StringToUint(userId)
	if err != nil {
		return err
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		// Prevent deleting the last admin
		var user models.User
		txErr := tx.Where("id = ?", userId).First(&user).Error
		if txErr != nil {
			return txErr
		}
		if user.UserRole == models.ADMIN {
			var adminCount int64
			txErr = tx.Model(&models.User{}).Where("user_role = ?", models.ADMIN).Count(&adminCount).Error
			if txErr != nil {
				return txErr
			}
			if adminCount <= 1 {
				return errors.New("cannot delete the last admin account")
			}
		}

		var receipts []models.Receipt
		var groupIdsToNotDelete []uint
		notificationsRepository := repositories.NewNotificationRepository(tx)
		userPreferncesRepository := repositories.NewUserPreferencesRepository(tx)
		dashboardRepository := repositories.NewDashboardRepository(tx)
		groupService := NewGroupService(tx)
		receiptService := NewReceiptService(tx)

		// Remove refresh tokens
		txErr = tx.Where("user_id = ?", userId).Delete(&models.RefreshToken{}).Error
		if txErr != nil {
			return txErr
		}

		// Remove API keys (first nullify SystemTask.ApiKeyId references)
		var apiKeyIds []string
		txErr = tx.Model(&models.ApiKey{}).Where("user_id = ?", userId).Pluck("id", &apiKeyIds).Error
		if txErr != nil {
			return txErr
		}
		if len(apiKeyIds) > 0 {
			txErr = tx.Model(&models.SystemTask{}).Where("api_key_id IN ?", apiKeyIds).Update("api_key_id", nil).Error
			if txErr != nil {
				return txErr
			}
		}
		txErr = tx.Where("user_id = ?", userId).Delete(&models.ApiKey{}).Error
		if txErr != nil {
			return txErr
		}

		// Remove receipts that the user paid
		txErr = tx.Model(models.Receipt{}).Where("paid_by_user_id = ?", userId).Select("id").Find(&receipts).Error
		if txErr != nil {
			return txErr
		}

		for i := 0; i < len(receipts); i++ {
			txErr = receiptService.DeleteReceipt(utils.UintToString(receipts[i].ID))
			if txErr != nil {
				return txErr
			}
		}

		// Remove receipt items
		txErr = tx.Where("charged_to_user_id = ?", userId).Delete(&models.Item{}).Error
		if txErr != nil {
			return txErr
		}

		// Nullify comment user references
		txErr = tx.Model(&models.Comment{}).Where("user_id = ?", userId).Update("user_id", nil).Error
		if txErr != nil {
			return txErr
		}

		// Remove user's dashboards and widgets
		var dashboards []models.Dashboard
		txErr = tx.Where("user_id = ?", userId).Find(&dashboards).Error
		if txErr != nil {
			return txErr
		}
		for _, dashboard := range dashboards {
			txErr = dashboardRepository.DeleteDashboardById(dashboard.ID)
			if txErr != nil {
				return txErr
			}
		}

		// Remove groups where the user is the only user
		groups, txErr := groupService.GetGroupsForUser(userId)
		if txErr != nil {
			return txErr
		}
		for i := 0; i < len(groups); i++ {
			group := groups[i]
			if len(group.GroupMembers) == 1 {
				txErr := groupService.DeleteGroup(utils.UintToString(group.ID), true)
				if txErr != nil {
					return txErr
				}
			} else {
				groupIdsToNotDelete = append(groupIdsToNotDelete, group.ID)
			}
		}

		// Remove other group members
		for i := 0; i < len(groupIdsToNotDelete); i++ {
			txErr = tx.Delete(&models.GroupMember{}, "user_id = ? AND group_id = ?", userId, groupIdsToNotDelete[i]).Error
			if txErr != nil {
				return txErr
			}
		}

		// Remove user's notifications
		txErr = notificationsRepository.DeleteAllNotificationsForUser(uintUserId)
		if txErr != nil {
			return txErr
		}

		// Remove user's preferences
		txErr = userPreferncesRepository.DeleteUserPreferences(uintUserId)
		if txErr != nil {
			return txErr
		}

		// Remove user from other user's users preferences
		txErr = tx.Model(models.UserPrefernces{}).Where("quick_scan_default_paid_by_id = ?", userId).Update("quick_scan_default_paid_by_id", nil).Error
		if txErr != nil {
			return txErr
		}

		// Remove user from other's group settings
		txErr = tx.Model(models.GroupSettings{}).Where("email_default_receipt_paid_by_id = ?", userId).Update("email_default_receipt_paid_by_id", nil).Error
		if txErr != nil {
			return txErr
		}

		// Nullify SystemTask.RanByUserId references
		txErr = tx.Model(&models.SystemTask{}).Where("ran_by_user_id = ?", userId).Update("ran_by_user_id", nil).Error
		if txErr != nil {
			return txErr
		}

		// Nullify CreatedBy references across all tables
		modelsWithCreatedBy := []interface{}{
			&models.RefreshToken{},
			&models.User{},
			&models.CustomField{},
			&models.CustomFieldValue{},
			&models.CustomFieldOption{},
			&models.Receipt{},
			&models.Item{},
			&models.FileData{},
			&models.Tag{},
			&models.Category{},
			&models.Comment{},
			&models.Notification{},
			&models.UserShortcut{},
			&models.UserPrefernces{},
			&models.SubjectLineRegex{},
			&models.GroupSettingsWhiteListEmail{},
			&models.GroupSettings{},
			&models.Dashboard{},
			&models.Widget{},
			&models.TaskQueueConfiguration{},
			&models.SystemSettings{},
			&models.SystemEmail{},
			&models.SystemTask{},
			&models.ReceiptProcessingSettings{},
			&models.Prompt{},
			&models.GroupReceiptSettings{},
			&models.Pepper{},
			&models.ApiKey{},
			&models.Group{},
		}
		for _, model := range modelsWithCreatedBy {
			txErr = tx.Model(model).Where("created_by = ?", uintUserId).Update("created_by", nil).Error
			if txErr != nil {
				return txErr
			}
		}

		// Remove user
		txErr = tx.Model(models.User{}).Delete("id = ?", userId).Error
		if txErr != nil {
			return txErr
		}

		return nil
	})
	if err != nil {
		return err
	}

	return nil
}

func BulkDeleteUsers(userIds []string) error {
	for _, userId := range userIds {
		err := DeleteUser(userId)
		if err != nil {
			return err
		}
	}
	return nil
}

func DeleteAccountForUser(userId uint, password string) (int, error) {
	db := repositories.GetDB()
	var dbUser models.User

	err := db.Where("id = ?", userId).First(&dbUser).Error
	if err != nil {
		return http.StatusInternalServerError, err
	}

	err = utils.VerifyPassword(dbUser.Password, password)
	if err != nil {
		return http.StatusUnauthorized, errors.New("invalid password")
	}

	err = DeleteUser(utils.UintToString(userId))
	if err != nil {
		if err.Error() == "cannot delete the last admin account" {
			return http.StatusBadRequest, err
		}
		return http.StatusInternalServerError, err
	}

	return 0, nil
}
