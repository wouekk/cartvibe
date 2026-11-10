package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

// An add sent twice with the same client id (a phone that lost its signal before the answer arrived) adds one
// line and tells the household once.
func TestShoppingListAddWithClientIdIsSafeToRepeat(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")

	hub := services.GetShoppingListHub()
	subscriber := hub.Subscribe(1)
	defer hub.Unsubscribe(subscriber)

	first := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk","clientId":"3f6c1a52-0b1e-4c53-9a0e-1c2d3e4f5a6b"}`)
	second := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk","clientId":"3f6c1a52-0b1e-4c53-9a0e-1c2d3e4f5a6b"}`)

	if first.ID != second.ID {
		t.Fatalf("the repeated add made a second item: %d and %d", first.ID, second.ID)
	}
	if first.ClientId == nil || *first.ClientId != "3f6c1a52-0b1e-4c53-9a0e-1c2d3e4f5a6b" {
		t.Errorf("expected the item to carry its client id, got %+v", first.ClientId)
	}

	lists := getShoppingListsForTest(t, 1, "1")
	if len(lists[0].Items) != 1 {
		t.Errorf("expected 1 item, got %+v", lists[0].Items)
	}

	events := 0
	for {
		select {
		case event := <-subscriber.Events:
			if event.Type != models.ShoppingListEventItemAdded {
				t.Errorf("unexpected event %+v", event)
			}
			events++
			continue
		default:
		}
		break
	}
	if events != 1 {
		t.Errorf("expected one ITEM_ADDED for the two requests, got %d", events)
	}
}

// The repeat answers with the item as it is now, not as it was added: someone may have crossed it off between
// the two requests, and the repeat must not bring it back.
func TestShoppingListRepeatedAddDoesNotUndoALaterChange(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")

	milk := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk","clientId":"add-1"}`)
	setShoppingListItemCheckedForTest(t, 1, milk.ID, true)

	repeated := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk","clientId":"add-1"}`)
	if repeated.ID != milk.ID || !repeated.IsChecked {
		t.Errorf("expected the crossed-off item back unchanged, got %+v", repeated)
	}
}

// Two different adds of the same name stay two lines, and the same client id on another list is another item.
func TestShoppingListClientIdIsPerAddAndPerList(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	other := createShoppingListForTest(t, 1, "1", "Market")

	first := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk","clientId":"add-1"}`)
	second := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk","clientId":"add-2"}`)
	elsewhere := addShoppingListItemForTest(t, 1, other.ID, `{"name":"Milk","clientId":"add-1"}`)
	without := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)
	alsoWithout := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)

	ids := map[uint]bool{first.ID: true, second.ID: true, elsewhere.ID: true, without.ID: true, alsoWithout.ID: true}
	if len(ids) != 5 {
		t.Errorf("expected five separate items, got ids %v", ids)
	}
	if without.ClientId != nil {
		t.Errorf("an add without a client id must store none, got %q", *without.ClientId)
	}
}

// An add that brings a crossed-off item back carries its key onto that item, so its repeat finds it too.
func TestShoppingListRevivingAddIsSafeToRepeat(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	milk := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)
	setShoppingListItemCheckedForTest(t, 1, milk.ID, true)

	revived := addShoppingListItemForTest(t, 1, list.ID, `{"name":"milk","clientId":"add-9"}`)
	repeated := addShoppingListItemForTest(t, 1, list.ID, `{"name":"milk","clientId":"add-9"}`)

	if revived.ID != milk.ID || repeated.ID != milk.ID {
		t.Fatalf("expected both requests to answer with the revived item %d, got %d and %d", milk.ID, revived.ID, repeated.ID)
	}
	if revived.ClientId == nil || *revived.ClientId != "add-9" {
		t.Errorf("expected the revived item to carry the add's client id, got %+v", revived.ClientId)
	}

	lists := getShoppingListsForTest(t, 1, "1")
	if len(lists[0].Items) != 1 {
		t.Errorf("expected 1 item, got %+v", lists[0].Items)
	}
}

func TestShoppingListClientIdIsValidated(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")

	for _, clientId := range []string{strings.Repeat("a", 65), `<b>x</b>`, "two words"} {
		w, r := shoppingListRequest("POST", fmt.Sprintf(`{"name":"Milk","clientId":%q}`, clientId), 1, map[string]string{"listId": fmt.Sprint(list.ID)})
		AddShoppingListItem(w, r)
		assertStatus(t, w, http.StatusBadRequest)
	}
}

// The lists read carries an ETag and answers 304 without a body while nothing changed.
func TestShoppingListsReadIsRevalidated(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")

	w, r := shoppingListRequest("GET", "", 1, map[string]string{"groupId": "1"})
	GetShoppingListsForGroup(w, r)
	assertStatus(t, w, http.StatusOK)
	etag := w.Header().Get("ETag")
	if etag == "" || !strings.HasPrefix(etag, `"`) {
		t.Fatalf("expected a quoted ETag, got %q", etag)
	}
	if got := w.Header().Get("Cache-Control"); got != "private, no-cache" {
		t.Errorf("expected the answer to be revalidated every time, got Cache-Control %q", got)
	}

	// Unchanged: the same tag, also when a compressing proxy marked it weak, answers 304 with no body.
	for _, sent := range []string{etag, "W/" + etag, `"something-else", ` + etag} {
		w, r = shoppingListRequest("GET", "", 1, map[string]string{"groupId": "1"})
		r.Header.Set("If-None-Match", sent)
		GetShoppingListsForGroup(w, r)
		assertStatus(t, w, http.StatusNotModified)
		if w.Body.Len() != 0 {
			t.Errorf("a 304 must have no body, got %q", w.Body.String())
		}
	}

	// Changed: the old tag no longer matches and the new lists come back.
	addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)
	w, r = shoppingListRequest("GET", "", 1, map[string]string{"groupId": "1"})
	r.Header.Set("If-None-Match", etag)
	GetShoppingListsForGroup(w, r)
	assertStatus(t, w, http.StatusOK)
	if w.Header().Get("ETag") == etag {
		t.Error("the ETag did not change with the lists")
	}
	if !strings.Contains(w.Body.String(), `"name":"Milk"`) {
		t.Errorf("expected the changed lists, got %s", w.Body.String())
	}
}

// A matching tag never stands in for permission: the check runs first.
func TestShoppingListsReadChecksPermissionBeforeTheTag(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	createShoppingListForTest(t, 1, "1", "Supermarket")

	w, r := shoppingListRequest("GET", "", 1, map[string]string{"groupId": "1"})
	GetShoppingListsForGroup(w, r)
	etag := w.Header().Get("ETag")

	// User 4 belongs to group 2 only.
	w, r = shoppingListRequest("GET", "", 4, map[string]string{"groupId": "1"})
	r.Header.Set("If-None-Match", etag)
	GetShoppingListsForGroup(w, r)
	assertStatus(t, w, http.StatusForbidden)
}
