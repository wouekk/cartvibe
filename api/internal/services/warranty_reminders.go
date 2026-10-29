package services

import (
	"errors"
	"fmt"
	"time"

	"cartvibe/api/internal/i18n"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// warrantyReminderHour is the time of day, in the app time zone, a due warranty reminder goes out.
const warrantyReminderHour = 9

// WarrantyReminderKey names a receipt's reminder; one per person and receipt.
func WarrantyReminderKey(receiptId uint) string {
	return fmt.Sprintf("warranty-%d", receiptId)
}

// AppToday is today's calendar day in the app time zone, "yyyy-MM-dd".
func AppToday(now time.Time) string {
	return now.In(repositories.GetAppLocation()).Format(time.DateOnly)
}

// SyncWarrantyReminders plans the reminders of one receipt again: one for every member of its group who can read
// it, at that person's lead time, and none for anybody else. A receipt without a warranty date, with one that has
// already passed, or that no longer exists has no reminders. Called after every change that can move them (the
// warranty date, the receipt's group or payer); cheap enough to call when nothing changed.
func SyncWarrantyReminders(receiptId uint, now time.Time) error {
	db := repositories.GetDB()

	var receipt models.Receipt
	err := db.Select("id", "group_id", "warranty_until").Where("id = ?", receiptId).Take(&receipt).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return db.Where("receipt_id = ?", receiptId).Delete(&models.WarrantyReminder{}).Error
	}
	if err != nil {
		return err
	}

	today := AppToday(now)
	if receipt.WarrantyUntil == nil || *receipt.WarrantyUntil < today {
		return db.Where("receipt_id = ?", receiptId).Delete(&models.WarrantyReminder{}).Error
	}

	members, err := repositories.NewGroupMemberRepository(nil).GetsGroupMembersByGroupId(utils.UintToString(receipt.GroupId))
	if err != nil {
		return err
	}

	recipients := make([]uint, 0, len(members))
	for _, member := range members {
		if canSeeReceipt(member.UserID, receiptId) {
			recipients = append(recipients, member.UserID)
		}
	}

	return db.Transaction(func(tx *gorm.DB) error {
		removed := tx.Where("receipt_id = ?", receiptId)
		if len(recipients) > 0 {
			removed = removed.Where("user_id NOT IN ?", recipients)
		}
		if err := removed.Delete(&models.WarrantyReminder{}).Error; err != nil {
			return err
		}

		for _, userId := range recipients {
			preferences, err := repositories.NewUserPreferencesRepository(tx).GetUserPreferencesOrCreate(userId)
			if err != nil {
				return err
			}
			fireOn, ok := WarrantyFireOn(*receipt.WarrantyUntil, LeadDaysOrDefault(preferences.WarrantyReminderLeadDays), today)
			if !ok {
				continue
			}

			reminder := models.WarrantyReminder{
				UserId:        userId,
				Key:           WarrantyReminderKey(receiptId),
				ReceiptId:     receiptId,
				WarrantyUntil: *receipt.WarrantyUntil,
				FireOn:        fireOn,
			}
			// Replaces the person's reminder for this receipt; fired_for is kept, so the same date never
			// fires twice.
			err = tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "user_id"}, {Name: "key"}},
				DoUpdates: clause.AssignmentColumns([]string{"receipt_id", "warranty_until", "fire_on", "updated_at"}),
			}).Create(&reminder).Error
			if err != nil {
				return err
			}
		}

		return nil
	})
}

// SyncWarrantyRemindersForUser plans again every reminder that involves the person, after their lead time changed.
func SyncWarrantyRemindersForUser(userId uint, now time.Time) error {
	groupIds, err := repositories.NewGroupMemberRepository(nil).GetGroupIdsByUserId(utils.UintToString(userId))
	if err != nil {
		return err
	}
	if len(groupIds) == 0 {
		return nil
	}

	var receiptIds []uint
	err = repositories.GetDB().Model(&models.Receipt{}).
		Where("group_id IN ? AND warranty_until IS NOT NULL AND warranty_until >= ?", groupIds, AppToday(now)).
		Pluck("id", &receiptIds).Error
	if err != nil {
		return err
	}

	return syncWarrantyRemindersFor(receiptIds, now)
}

// SyncWarrantyRemindersForGroup plans again the reminders of every running warranty in the group, after its roster,
// roles or member grants changed: a new member is reminded too, one who lost sight of a receipt is not.
func SyncWarrantyRemindersForGroup(groupId uint, now time.Time) error {
	var receiptIds []uint
	err := repositories.GetDB().Model(&models.Receipt{}).
		Where("group_id = ? AND warranty_until IS NOT NULL AND warranty_until >= ?", groupId, AppToday(now)).
		Pluck("id", &receiptIds).Error
	if err != nil {
		return err
	}

	return syncWarrantyRemindersFor(receiptIds, now)
}

// SyncWarrantyRemindersForGroupQuietly is SyncWarrantyRemindersForGroup for request handlers (see
// SyncWarrantyRemindersQuietly).
func SyncWarrantyRemindersForGroupQuietly(groupId uint) {
	if err := SyncWarrantyRemindersForGroup(groupId, time.Now()); err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "warranty reminders: "+err.Error())
	}
}

// SyncAllWarrantyReminders plans every reminder again, and drops those of receipts that lost their date. Run at
// start-up, so a reminder never depends on a change having been seen by this process.
func SyncAllWarrantyReminders(now time.Time) error {
	db := repositories.GetDB()

	var receiptIds []uint
	err := db.Model(&models.Receipt{}).Where("warranty_until IS NOT NULL").Pluck("id", &receiptIds).Error
	if err != nil {
		return err
	}

	var plannedIds []uint
	err = db.Model(&models.WarrantyReminder{}).Distinct("receipt_id").Pluck("receipt_id", &plannedIds).Error
	if err != nil {
		return err
	}

	return syncWarrantyRemindersFor(append(receiptIds, plannedIds...), now)
}

func syncWarrantyRemindersFor(receiptIds []uint, now time.Time) error {
	seen := make(map[uint]bool, len(receiptIds))
	for _, receiptId := range receiptIds {
		if seen[receiptId] {
			continue
		}
		seen[receiptId] = true
		if err := SyncWarrantyReminders(receiptId, now); err != nil {
			return err
		}
	}
	return nil
}

// SyncWarrantyRemindersQuietly is SyncWarrantyReminders for request handlers: a reminder must never fail the save
// it follows, so an error is logged and the start-up sync catches up.
func SyncWarrantyRemindersQuietly(receiptId uint) {
	if err := SyncWarrantyReminders(receiptId, time.Now()); err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "warranty reminders: "+err.Error())
	}
}

// canSeeReceipt is the receipt read gate the REST and MCP reads share (group read permission, paid-by visibility,
// member isolation).
func canSeeReceipt(userId uint, receiptId uint) bool {
	_, err := NewReceiptService(nil).GetReceiptForUser(userId, utils.UintToString(receiptId))
	return err == nil
}

// FireDueWarrantyReminders sends the reminders whose day has come, once the app zone's clock has passed 09:00.
// Each fires once per receipt and date: the claim (setting fired_for) and the notification are one transaction,
// so a rerun, a second sweep or a re-save of the same date never creates a second one. A person who can no longer
// see the receipt gets nothing and loses the reminder. Reminders of warranties that have ended are dropped. It
// returns how many went out.
func FireDueWarrantyReminders(now time.Time) (int, error) {
	db := repositories.GetDB()
	local := now.In(repositories.GetAppLocation())
	today := local.Format(time.DateOnly)

	if err := db.Where("warranty_until < ?", today).Delete(&models.WarrantyReminder{}).Error; err != nil {
		return 0, err
	}
	if local.Hour() < warrantyReminderHour {
		return 0, nil
	}

	var due []models.WarrantyReminder
	err := db.Where("fire_on <= ? AND (fired_for IS NULL OR fired_for <> warranty_until)", today).
		Order("fire_on ASC").Limit(200).Find(&due).Error
	if err != nil {
		return 0, err
	}

	sent := 0
	for _, reminder := range due {
		if !canSeeReceipt(reminder.UserId, reminder.ReceiptId) {
			if err := db.Delete(&models.WarrantyReminder{}, reminder.ID).Error; err != nil {
				return sent, err
			}
			continue
		}

		message, err := buildWarrantyMessage(reminder, local)
		if err != nil {
			return sent, err
		}

		claimed := false
		err = db.Transaction(func(tx *gorm.DB) error {
			result := tx.Model(&models.WarrantyReminder{}).
				Where("id = ? AND warranty_until = ? AND (fired_for IS NULL OR fired_for <> warranty_until)", reminder.ID, reminder.WarrantyUntil).
				Update("fired_for", reminder.WarrantyUntil)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return nil
			}
			claimed = true

			// No actor: the feed hides only a person's own actions, so this always shows.
			return tx.Create(&models.Notification{
				Type:   models.NOTIFICATION_TYPE_NORMAL,
				Title:  message.title,
				Body:   message.body + " " + repositories.BuildParamaterisedString("receiptId", reminder.ReceiptId, "id", "link"),
				UserId: reminder.UserId,
			}).Error
		})
		if err != nil {
			return sent, err
		}
		if !claimed {
			continue
		}

		sent++
		SendWebPushQuietly(reminder.UserId, WebPushMessage{
			Title: message.title,
			Body:  message.body,
			Url:   fmt.Sprintf("/receipts/%d/view", reminder.ReceiptId),
			Tag:   reminder.Key,
		})
	}

	return sent, nil
}

type warrantyMessage struct {
	title string
	body  string
}

// buildWarrantyMessage writes the reminder in the person's language: "Warranty ends 12 March" (or "today") and the
// shop, never the amount.
func buildWarrantyMessage(reminder models.WarrantyReminder, local time.Time) (warrantyMessage, error) {
	db := repositories.GetDB()

	var receipt models.Receipt
	if err := db.Select("id", "name", "shop_name").Where("id = ?", reminder.ReceiptId).Take(&receipt).Error; err != nil {
		return warrantyMessage{}, err
	}
	preferences, err := repositories.NewUserPreferencesRepository(nil).GetUserPreferencesOrCreate(reminder.UserId)
	if err != nil {
		return warrantyMessage{}, err
	}
	translator := i18n.For(preferences.Language)

	end, err := time.Parse(time.DateOnly, reminder.WarrantyUntil)
	if err != nil {
		return warrantyMessage{}, err
	}

	title := translator.T("Warranty ends today")
	if reminder.WarrantyUntil != local.Format(time.DateOnly) {
		title = translator.T("Warranty ends {date}", "date", translator.Day(end, end.Year() != local.Year()))
	}

	shop := receipt.ShopName
	if shop == "" {
		shop = receipt.Name
	}

	return warrantyMessage{
		title: title,
		body:  translator.T("Your purchase at {shop}", "shop", shop),
	}, nil
}
