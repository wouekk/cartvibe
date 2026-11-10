package services

import (
	"testing"
	"time"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"

	"github.com/shopspring/decimal"
)

// shoppingListFixture is one group with a user and an empty list, and a subscriber on the group's events.
type shoppingListFixture struct {
	service    ShoppingListService
	groupId    uint
	userId     uint
	list       models.ShoppingList
	subscriber *ShoppingListSubscriber
}

func newShoppingListFixture(t *testing.T) shoppingListFixture {
	t.Helper()
	db := repositories.GetDB()
	user := models.User{Username: "shopper", DisplayName: "Shopper", Password: "x"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	group := models.Group{Name: "Home", Status: models.GROUP_ACTIVE}
	if err := db.Create(&group).Error; err != nil {
		t.Fatal(err)
	}

	service := NewShoppingListService(nil)
	list, err := service.CreateShoppingList(group.ID, commands.UpsertShoppingListCommand{Name: "Weekly"}, user.ID)
	if err != nil {
		t.Fatal(err)
	}

	subscriber := GetShoppingListHub().Subscribe(group.ID)
	t.Cleanup(func() {
		GetShoppingListHub().Unsubscribe(subscriber)
		repositories.TruncateTestDb()
	})
	return shoppingListFixture{service: service, groupId: group.ID, userId: user.ID, list: list, subscriber: subscriber}
}

func (fx shoppingListFixture) add(t *testing.T, command commands.UpsertShoppingListItemCommand) models.ShoppingListItem {
	t.Helper()
	item, err := fx.service.AddShoppingListItem(fx.groupId, fx.list.ID, command, fx.userId)
	if err != nil {
		t.Fatal(err)
	}
	receiveShoppingListEvent(t, fx.subscriber)
	return item
}

func classify(t *testing.T, itemId uint, overridden bool) {
	t.Helper()
	now := time.Now()
	err := repositories.GetDB().Model(&models.ShoppingListItem{}).Where("id = ?", itemId).Updates(map[string]any{
		"health": models.HEALTH_HEALTHY, "seasonality": models.SEASONALITY_SEASONAL, "classified_at": &now,
		"classification_overridden": overridden,
	}).Error
	if err != nil {
		t.Fatal(err)
	}
}

func TestRevivingACrossedOffItemKeepsWhatTheRequestLeavesOut(t *testing.T) {
	fx := newShoppingListFixture(t)
	two := decimal.NewFromInt(2)
	item := fx.add(t, commands.UpsertShoppingListItemCommand{Name: "Apples", Amount: &two, Unit: "kg", Note: "red ones"})
	classify(t, item.ID, false)
	if _, err := fx.service.SetShoppingListItemChecked(fx.groupId, item.ID, true, fx.userId); err != nil {
		t.Fatal(err)
	}
	receiveShoppingListEvent(t, fx.subscriber)

	revived, err := fx.service.AddShoppingListItem(fx.groupId, fx.list.ID, commands.UpsertShoppingListItemCommand{Name: "apples"}, fx.userId)
	if err != nil {
		t.Fatal(err)
	}
	if revived.ID != item.ID || revived.IsChecked || revived.CheckedAt != nil {
		t.Fatalf("the crossed-off item comes back unchecked: %+v", revived)
	}
	if revived.Amount == nil || !revived.Amount.Equal(two) || revived.Unit != "kg" || revived.Note != "red ones" {
		t.Errorf("amount, unit and note stay when not sent: %+v", revived)
	}
	if revived.ClassifiedAt != nil || revived.Seasonality != "" {
		t.Errorf("a revived item is classified again (another month, another season): %+v", revived.FoodClassification)
	}
	if event := receiveShoppingListEvent(t, fx.subscriber); event.Type != models.ShoppingListEventItemToggled || event.Item.ID != item.ID {
		t.Errorf("reviving is a toggle, got %+v", event)
	}
}

func TestAddingANameThatIsStillOnTheListAddsASecondLine(t *testing.T) {
	fx := newShoppingListFixture(t)
	first := fx.add(t, commands.UpsertShoppingListItemCommand{Name: "Milk"})
	second := fx.add(t, commands.UpsertShoppingListItemCommand{Name: "Milk"})
	if first.ID == second.ID {
		t.Errorf("an unchecked item is never merged into")
	}
}

func TestRenamingAnItemDropsItsTagsButACaseChangeDoesNot(t *testing.T) {
	fx := newShoppingListFixture(t)
	item := fx.add(t, commands.UpsertShoppingListItemCommand{Name: "Bread"})
	classify(t, item.ID, true)

	same, err := fx.service.UpdateShoppingListItem(fx.groupId, item.ID, commands.UpsertShoppingListItemCommand{Name: "BREAD"})
	if err != nil {
		t.Fatal(err)
	}
	if same.ClassifiedAt == nil || !same.ClassificationOverridden {
		t.Errorf("the same product keeps its tags: %+v", same.FoodClassification)
	}
	receiveShoppingListEvent(t, fx.subscriber)

	renamed, err := fx.service.UpdateShoppingListItem(fx.groupId, item.ID, commands.UpsertShoppingListItemCommand{Name: "Butter"})
	if err != nil {
		t.Fatal(err)
	}
	if renamed.ClassifiedAt != nil || renamed.ClassificationOverridden || renamed.Health != "" {
		t.Errorf("another product loses the old tags and correction: %+v", renamed.FoodClassification)
	}
	if event := receiveShoppingListEvent(t, fx.subscriber); event.Type != models.ShoppingListEventItemUpdated {
		t.Errorf("expected ITEM_UPDATED, got %+v", event)
	}
}

func TestAFailedWritePublishesNothing(t *testing.T) {
	fx := newShoppingListFixture(t)

	missing := uint(999999)
	if _, err := fx.service.UpdateShoppingListItem(fx.groupId, missing, commands.UpsertShoppingListItemCommand{Name: "x"}); err == nil {
		t.Error("updating an unknown item must fail")
	}
	if _, err := fx.service.SetShoppingListItemChecked(fx.groupId, missing, true, fx.userId); err == nil {
		t.Error("checking an unknown item must fail")
	}
	if err := fx.service.DeleteShoppingListItem(fx.groupId, missing); err == nil {
		t.Error("deleting an unknown item must fail")
	}
	assertNoShoppingListEvent(t, fx.subscriber)
}

func TestNothingChangedMeansNothingIsBroadcast(t *testing.T) {
	fx := newShoppingListFixture(t)
	item := fx.add(t, commands.UpsertShoppingListItemCommand{Name: "Eggs"})

	unchanged, err := fx.service.SetShoppingListItemChecked(fx.groupId, item.ID, false, fx.userId)
	if err != nil || unchanged.IsChecked {
		t.Fatalf("unchecking an unchecked item: %+v, %v", unchanged, err)
	}
	if _, err := fx.service.SetShoppingListChecked(fx.groupId, fx.list.ID, nil, false, fx.userId); err != nil {
		t.Fatal(err)
	}
	cleared, err := fx.service.ClearCheckedShoppingListItems(fx.groupId, fx.list.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cleared == nil || len(cleared) != 0 {
		t.Errorf("clearing nothing answers an empty list, not null: %#v", cleared)
	}
	assertNoShoppingListEvent(t, fx.subscriber)
}

func TestCheckingKeepsTheFirstCheckedAt(t *testing.T) {
	fx := newShoppingListFixture(t)
	item := fx.add(t, commands.UpsertShoppingListItemCommand{Name: "Tea"})

	checked, err := fx.service.SetShoppingListItemChecked(fx.groupId, item.ID, true, fx.userId)
	if err != nil || checked.CheckedAt == nil || checked.CheckedByUserId == nil || *checked.CheckedByUserId != fx.userId {
		t.Fatalf("checked: %+v, %v", checked, err)
	}
	receiveShoppingListEvent(t, fx.subscriber)

	again, _ := fx.service.SetShoppingListItemChecked(fx.groupId, item.ID, true, fx.userId)
	if again.CheckedAt == nil || !again.CheckedAt.Equal(*checked.CheckedAt) {
		t.Errorf("re-checking keeps the original time: %v then %v", checked.CheckedAt, again.CheckedAt)
	}
}

func TestCompletingSomeItemsLeavesTheOthers(t *testing.T) {
	fx := newShoppingListFixture(t)
	first := fx.add(t, commands.UpsertShoppingListItemCommand{Name: "Rice"})
	second := fx.add(t, commands.UpsertShoppingListItemCommand{Name: "Beans"})

	list, err := fx.service.SetShoppingListChecked(fx.groupId, fx.list.ID, []uint{first.ID}, true, fx.userId)
	if err != nil {
		t.Fatal(err)
	}
	checked := map[uint]bool{}
	for _, item := range list.Items {
		checked[item.ID] = item.IsChecked
	}
	if !checked[first.ID] || checked[second.ID] {
		t.Errorf("only the given item is crossed off: %v", checked)
	}
	event := receiveShoppingListEvent(t, fx.subscriber)
	if event.Type != models.ShoppingListEventListUpdated || event.List == nil || event.List.ID != fx.list.ID {
		t.Errorf("the whole list is broadcast, got %+v", event)
	}
}

func TestDeletingAListBroadcastsAndRemovesItsItems(t *testing.T) {
	fx := newShoppingListFixture(t)
	item := fx.add(t, commands.UpsertShoppingListItemCommand{Name: "Salt"})

	if err := fx.service.DeleteShoppingList(fx.groupId, fx.list.ID); err != nil {
		t.Fatal(err)
	}
	event := receiveShoppingListEvent(t, fx.subscriber)
	if event.Type != models.ShoppingListEventListDeleted || event.ShoppingListId != fx.list.ID {
		t.Errorf("expected LIST_DELETED, got %+v", event)
	}
	var count int64
	repositories.GetDB().Model(&models.ShoppingListItem{}).Where("id = ?", item.ID).Count(&count)
	if count != 0 {
		t.Errorf("the list's items go with it")
	}
	lists, err := fx.service.GetShoppingListsForGroup(fx.groupId)
	if err != nil || lists == nil || len(lists) != 0 {
		t.Errorf("an empty group answers [], got %#v (%v)", lists, err)
	}
}
