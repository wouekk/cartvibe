package repositories

import (
	"errors"
	"receipt-wrangler/api/internal/models"
	"testing"

	"gorm.io/gorm"
)

func seedShoppingList(t *testing.T, groupId uint, itemNames ...string) models.ShoppingList {
	t.Helper()
	repository := NewShoppingListRepository(nil)

	list, err := repository.CreateShoppingList(models.ShoppingList{GroupId: groupId, Name: "List"})
	if err != nil {
		t.Fatalf("create list: %v", err)
	}

	for _, name := range itemNames {
		_, err := repository.CreateShoppingListItem(models.ShoppingListItem{ShoppingListId: list.ID, Name: name})
		if err != nil {
			t.Fatalf("create item: %v", err)
		}
	}

	return list
}

func TestDeleteShoppingListsForGroupLeavesOtherGroups(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroupWithUsers()
	seedShoppingList(t, 1, "Milk", "Bread")
	seedShoppingList(t, 1, "Nails")
	kept := seedShoppingList(t, 2, "Eggs")

	err := GetDB().Transaction(func(tx *gorm.DB) error {
		return NewShoppingListRepository(tx).DeleteShoppingListsForGroup(1)
	})
	if err != nil {
		t.Fatalf("delete: %v", err)
	}

	var lists []models.ShoppingList
	GetDB().Find(&lists)
	if len(lists) != 1 || lists[0].ID != kept.ID {
		t.Errorf("expected only group 2's list to remain, got %+v", lists)
	}

	var items []models.ShoppingListItem
	GetDB().Find(&items)
	if len(items) != 1 || items[0].Name != "Eggs" {
		t.Errorf("expected only group 2's item to remain, got %+v", items)
	}
}

func TestGetGroupIdForShoppingListItem(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroupWithUsers()
	list := seedShoppingList(t, 2, "Eggs")
	repository := NewShoppingListRepository(nil)

	listGroupId, err := repository.GetGroupIdForShoppingList(list.ID)
	if err != nil || listGroupId != 2 {
		t.Errorf("expected list group 2, got %d (%v)", listGroupId, err)
	}

	itemGroupId, err := repository.GetGroupIdForShoppingListItem(1)
	if err != nil || itemGroupId != 2 {
		t.Errorf("expected item group 2, got %d (%v)", itemGroupId, err)
	}

	_, err = repository.GetGroupIdForShoppingListItem(9999)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("expected not found for an unknown item, got %v", err)
	}

	_, err = repository.GetGroupIdForShoppingList(9999)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("expected not found for an unknown list, got %v", err)
	}
}
