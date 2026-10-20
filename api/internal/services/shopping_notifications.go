package services

import (
	"fmt"
	"receipt-wrangler/api/internal/logging"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"time"
)

// itemAddedNotificationWindow keeps someone adding ten items one after another from sending the
// household ten bells: the same message to the same group is sent at most once in this window.
const itemAddedNotificationWindow = 15 * time.Minute

// notifyHousehold tells everyone in the group except the person who did it (Phase 3 N1). It is
// best-effort: a notification must never fail or delay the change it is about, so errors are logged.
// A positive window drops the message when an identical one (same title and body) was already
// sent to the group inside it.
func notifyHousehold(groupId uint, actorUserId uint, title string, body string, window time.Duration) {
	if window > 0 {
		var recent int64
		err := repositories.GetDB().Model(&models.Notification{}).
			Where("title = ? AND body = ? AND created_at > ?", title, body, time.Now().Add(-window)).
			Count(&recent).Error
		if err == nil && recent > 0 {
			return
		}
	}

	err := repositories.NewNotificationRepository(nil).SendNotificationToGroup(
		groupId,
		title,
		body,
		models.NOTIFICATION_TYPE_NORMAL,
		[]interface{}{actorUserId},
	)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "could not send the household notification:", err.Error())
	}
}

func shoppingListName(listId uint) string {
	var list models.ShoppingList
	if err := repositories.GetDB().Select("id", "name").First(&list, listId).Error; err != nil {
		return "a shopping list"
	}

	return list.Name
}

func actorString(userId uint) string {
	return repositories.BuildParamaterisedString("userId", userId, "displayName", "string")
}

func groupString(groupId uint) string {
	return repositories.BuildParamaterisedString("groupId", groupId, "name", "string")
}

func notifyListCreated(groupId uint, actorUserId uint, listName string) {
	notifyHousehold(groupId, actorUserId, "New shopping list",
		fmt.Sprintf("%s started the list %s in %s.", actorString(actorUserId), listName, groupString(groupId)), 0)
}

func notifyItemAdded(groupId uint, actorUserId uint, listId uint) {
	notifyHousehold(groupId, actorUserId, "Shopping list updated",
		fmt.Sprintf("%s added to the list %s.", actorString(actorUserId), shoppingListName(listId)),
		itemAddedNotificationWindow)
}

// AnnounceGoingShopping is the "Going shopping" call to action (Phase 3 S4): everyone else in the
// household is told to add what they need before the trip. Announcing again within the window is
// ignored, so a double tap does not ring the house twice.
func (service ShoppingListService) AnnounceGoingShopping(groupId uint, userId uint) {
	notifyHousehold(groupId, userId, "Going shopping",
		fmt.Sprintf("%s is going shopping. Add what you need to the lists in %s.", actorString(userId), groupString(groupId)),
		itemAddedNotificationWindow)
}
