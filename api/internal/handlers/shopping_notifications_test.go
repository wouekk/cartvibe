package handlers

import (
	"fmt"
	"net/http"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"testing"
)

func notificationsFor(userId uint, title string) []models.Notification {
	var found []models.Notification
	repositories.GetDB().Where("user_id = ? AND title = ?", userId, title).Find(&found)
	return found
}

// groupMemberIds lists the users of group 1 besides the actor, which is what the household is.
func otherMembers(t *testing.T, actor uint) []uint {
	t.Helper()
	var members []models.GroupMember
	repositories.GetDB().Where("group_id = 1").Find(&members)
	others := []uint{}
	for _, member := range members {
		if member.UserID != actor {
			others = append(others, member.UserID)
		}
	}
	if len(others) == 0 {
		t.Fatal("the test group needs a second member")
	}
	return others
}

func TestHouseholdIsToldAboutANewListButNotTheCreator(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	createShoppingListForTest(t, 1, "1", "Supermarket")

	if got := notificationsFor(1, "New shopping list"); len(got) != 0 {
		t.Errorf("the creator should not be notified, got %d", len(got))
	}
	for _, other := range otherMembers(t, 1) {
		if got := notificationsFor(other, "New shopping list"); len(got) != 1 {
			t.Errorf("member %d: expected 1 notification, got %d", other, len(got))
		}
	}
}

func TestAddingManyItemsRingsTheHouseholdOnce(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")

	addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)
	addShoppingListItemForTest(t, 1, list.ID, `{"name":"Bread"}`)
	addShoppingListItemForTest(t, 1, list.ID, `{"name":"Eggs"}`)

	for _, other := range otherMembers(t, 1) {
		if got := notificationsFor(other, "Shopping list updated"); len(got) != 1 {
			t.Errorf("member %d: expected 1 notification for three items, got %d", other, len(got))
		}
	}
	if got := notificationsFor(1, "Shopping list updated"); len(got) != 0 {
		t.Errorf("the actor should not be notified, got %d", len(got))
	}
}

func TestGoingShoppingNotifiesOthersOnceAndNeedsListAccess(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()

	w, r := shoppingListRequest("POST", "", 1, map[string]string{"groupId": "1"})
	AnnounceGoingShopping(w, r)
	if w.Result().StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 without list access, got %d", w.Result().StatusCode)
	}

	grantAllGroupPerms(t, 1, 1)
	for i := 0; i < 2; i++ {
		w, r = shoppingListRequest("POST", "", 1, map[string]string{"groupId": "1"})
		AnnounceGoingShopping(w, r)
		assertStatus(t, w, http.StatusOK)
	}

	for _, other := range otherMembers(t, 1) {
		if got := notificationsFor(other, "Going shopping"); len(got) != 1 {
			t.Errorf("member %d: expected one announcement, got %d", other, len(got))
		}
	}
}

func TestGoingShoppingRejectsTheAllGroup(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	allGroup := models.Group{Name: "All", IsAllGroup: true}
	repositories.GetDB().Create(&allGroup)
	repositories.GetDB().Create(&models.GroupMember{UserID: 1, GroupID: allGroup.ID})
	grantAllGroupPerms(t, 1, allGroup.ID)

	w, r := shoppingListRequest("POST", "", 1, map[string]string{"groupId": fmt.Sprint(allGroup.ID)})
	AnnounceGoingShopping(w, r)
	assertStatus(t, w, http.StatusBadRequest)
}
