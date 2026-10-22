package handlers

import (
	"bufio"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
	"github.com/go-chi/chi/v5"
)

func tearDownShoppingListTest() {
	repositories.TruncateTestDb()
	services.ClearRolePermissionCacheForTests()
}

// withShoppingListClaims attaches JWT claims for userId, as the auth middleware would.
func withShoppingListClaims(r *http.Request, userId uint) *http.Request {
	ctx := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: userId}})
	return r.WithContext(ctx)
}

// shoppingListRequest builds a request carrying chi URL params and JWT claims for userId.
func shoppingListRequest(method string, body string, userId uint, params map[string]string) (*httptest.ResponseRecorder, *http.Request) {
	w := httptest.NewRecorder()
	r := httptest.NewRequest(method, "/api/shopping-list", strings.NewReader(body))

	rctx := chi.NewRouteContext()
	for key, value := range params {
		rctx.URLParams.Add(key, value)
	}
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))

	return w, withShoppingListClaims(r, userId)
}

func decodeShoppingListResponse[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var result T
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode response %q: %v", w.Body.String(), err)
	}
	return result
}

func createShoppingListForTest(t *testing.T, userId uint, groupId string, name string) models.ShoppingList {
	t.Helper()
	w, r := shoppingListRequest("POST", fmt.Sprintf(`{"name":%q}`, name), userId, map[string]string{"groupId": groupId})
	CreateShoppingList(w, r)
	assertStatus(t, w, http.StatusOK)
	return decodeShoppingListResponse[models.ShoppingList](t, w)
}

func addShoppingListItemForTest(t *testing.T, userId uint, listId uint, body string) models.ShoppingListItem {
	t.Helper()
	w, r := shoppingListRequest("POST", body, userId, map[string]string{"listId": fmt.Sprint(listId)})
	AddShoppingListItem(w, r)
	assertStatus(t, w, http.StatusOK)
	return decodeShoppingListResponse[models.ShoppingListItem](t, w)
}

func setShoppingListItemCheckedForTest(t *testing.T, userId uint, itemId uint, isChecked bool) models.ShoppingListItem {
	t.Helper()
	w, r := shoppingListRequest("PUT", fmt.Sprintf(`{"isChecked":%t}`, isChecked), userId, map[string]string{"itemId": fmt.Sprint(itemId)})
	SetShoppingListItemChecked(w, r)
	assertStatus(t, w, http.StatusOK)
	return decodeShoppingListResponse[models.ShoppingListItem](t, w)
}

func getShoppingListsForTest(t *testing.T, userId uint, groupId string) []models.ShoppingList {
	t.Helper()
	w, r := shoppingListRequest("GET", "", userId, map[string]string{"groupId": groupId})
	GetShoppingListsForGroup(w, r)
	assertStatus(t, w, http.StatusOK)
	return decodeShoppingListResponse[[]models.ShoppingList](t, w)
}

func TestShoppingListCreateReturnsEmptyItemsArray(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	w, r := shoppingListRequest("POST", `{"name":"  Supermarket  "}`, 1, map[string]string{"groupId": "1"})
	CreateShoppingList(w, r)
	assertStatus(t, w, http.StatusOK)

	// The generated Dart deserializer has no null guard: an itemless list must send [], never null.
	if !strings.Contains(w.Body.String(), `"items":[]`) {
		t.Errorf("expected items to serialize as [], got %s", w.Body.String())
	}

	list := decodeShoppingListResponse[models.ShoppingList](t, w)
	if list.Name != "Supermarket" || list.GroupId != 1 {
		t.Errorf("unexpected list %+v", list)
	}

	w, r = shoppingListRequest("GET", "", 1, map[string]string{"groupId": "1"})
	GetShoppingListsForGroup(w, r)
	assertStatus(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), `"items":[]`) {
		t.Errorf("expected items to serialize as [] on the group fetch, got %s", w.Body.String())
	}
}

func TestShoppingListCreateValidatesName(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	w, r := shoppingListRequest("POST", `{"name":""}`, 1, map[string]string{"groupId": "1"})
	CreateShoppingList(w, r)
	assertStatus(t, w, http.StatusBadRequest)
}

func TestShoppingListEndpointsRequirePermissions(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	item := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)

	// User 2 is a member of group 1 but holds only read.
	grantGroupPerms(t, 2, 1, permissions.GroupShoppingListsRead)
	listParam := map[string]string{"listId": fmt.Sprint(list.ID)}
	itemParam := map[string]string{"itemId": fmt.Sprint(item.ID)}

	tests := map[string]struct {
		handler func(http.ResponseWriter, *http.Request)
		method  string
		body    string
		params  map[string]string
	}{
		"create list":   {CreateShoppingList, "POST", `{"name":"x"}`, map[string]string{"groupId": "1"}},
		"update list":   {UpdateShoppingList, "PUT", `{"name":"x"}`, listParam},
		"delete list":   {DeleteShoppingList, "DELETE", "", listParam},
		"add item":      {AddShoppingListItem, "POST", `{"name":"x"}`, listParam},
		"update item":   {UpdateShoppingListItem, "PUT", `{"name":"x"}`, itemParam},
		"check item":    {SetShoppingListItemChecked, "PUT", `{"isChecked":true}`, itemParam},
		"delete item":   {DeleteShoppingListItem, "DELETE", "", itemParam},
		"clear checked": {ClearCheckedShoppingListItems, "POST", "", listParam},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			w, r := shoppingListRequest(test.method, test.body, 2, test.params)
			test.handler(w, r)
			assertStatus(t, w, http.StatusForbidden)
		})
	}

	// Read alone is enough to see the lists.
	lists := getShoppingListsForTest(t, 2, "1")
	if len(lists) != 1 || len(lists[0].Items) != 1 {
		t.Errorf("expected the read-only member to see 1 list with 1 item, got %+v", lists)
	}
}

func TestShoppingListMemberWithoutReadIsDenied(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	// User 1 is a member of group 1 but holds no shopping-list permission.

	w, r := shoppingListRequest("GET", "", 1, map[string]string{"groupId": "1"})
	GetShoppingListsForGroup(w, r)
	assertStatus(t, w, http.StatusForbidden)
}

func TestShoppingListOtherGroupsListIsUnreachable(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	item := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)

	// User 4 has every permission, but only in group 2.
	grantAllGroupPerms(t, 4, 2)

	w, r := shoppingListRequest("PUT", `{"name":"hijacked"}`, 4, map[string]string{"listId": fmt.Sprint(list.ID)})
	UpdateShoppingList(w, r)
	assertStatus(t, w, http.StatusForbidden)

	w, r = shoppingListRequest("PUT", `{"isChecked":true}`, 4, map[string]string{"itemId": fmt.Sprint(item.ID)})
	SetShoppingListItemChecked(w, r)
	assertStatus(t, w, http.StatusForbidden)

	w, r = shoppingListRequest("GET", "", 4, map[string]string{"groupId": "1"})
	GetShoppingListsForGroup(w, r)
	assertStatus(t, w, http.StatusForbidden)
}

func TestShoppingListUnknownIdIsIndistinguishableFromDenial(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	grantAllGroupPerms(t, 4, 2)

	// A real list in a group the caller cannot reach...
	denied, r := shoppingListRequest("PUT", `{"name":"x"}`, 4, map[string]string{"listId": fmt.Sprint(list.ID)})
	UpdateShoppingList(denied, r)

	// ...and lists that do not exist must look identical.
	for _, listId := range []string{"9999", "not-a-number"} {
		missing, r := shoppingListRequest("PUT", `{"name":"x"}`, 4, map[string]string{"listId": listId})
		UpdateShoppingList(missing, r)

		assertStatus(t, missing, http.StatusForbidden)
		if missing.Body.String() != denied.Body.String() {
			t.Errorf("unknown id %s leaked existence: %q vs %q", listId, missing.Body.String(), denied.Body.String())
		}
	}

	missingItem, r := shoppingListRequest("DELETE", "", 4, map[string]string{"itemId": "9999"})
	DeleteShoppingListItem(missingItem, r)
	assertStatus(t, missingItem, http.StatusForbidden)
	if missingItem.Body.String() != denied.Body.String() {
		t.Errorf("unknown item id leaked existence: %q", missingItem.Body.String())
	}
}

func TestShoppingListAllGroupIsRejected(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	repositories.GetDB().Model(&models.Group{}).Where("id = ?", 1).Update("is_all_group", true)

	w, r := shoppingListRequest("GET", "", 1, map[string]string{"groupId": "1"})
	GetShoppingListsForGroup(w, r)
	assertStatus(t, w, http.StatusBadRequest)

	w, r = shoppingListRequest("POST", `{"name":"x"}`, 1, map[string]string{"groupId": "1"})
	CreateShoppingList(w, r)
	assertStatus(t, w, http.StatusBadRequest)

	var count int64
	repositories.GetDB().Model(&models.ShoppingList{}).Count(&count)
	if count != 0 {
		t.Errorf("expected no list created in the All group, got %d", count)
	}
}

func TestShoppingListSetCheckedStampsAndClears(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	item := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)

	checked := setShoppingListItemCheckedForTest(t, 1, item.ID, true)
	if !checked.IsChecked || checked.CheckedAt == nil || checked.CheckedByUserId == nil || *checked.CheckedByUserId != 1 {
		t.Fatalf("expected a stamped checked item, got %+v", checked)
	}

	// Setting the state it is already in keeps the original stamp: "set", not "toggle".
	again := setShoppingListItemCheckedForTest(t, 1, item.ID, true)
	if !again.IsChecked || again.CheckedAt == nil || !again.CheckedAt.Equal(*checked.CheckedAt) {
		t.Errorf("re-checking changed the item: %+v vs %+v", again, checked)
	}

	unchecked := setShoppingListItemCheckedForTest(t, 1, item.ID, false)
	if unchecked.IsChecked || unchecked.CheckedAt != nil || unchecked.CheckedByUserId != nil {
		t.Errorf("expected un-check to clear the stamp, got %+v", unchecked)
	}
}

func TestShoppingListSetCheckedRequiresState(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	item := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)
	setShoppingListItemCheckedForTest(t, 1, item.ID, true)

	w, r := shoppingListRequest("PUT", `{}`, 1, map[string]string{"itemId": fmt.Sprint(item.ID)})
	SetShoppingListItemChecked(w, r)
	assertStatus(t, w, http.StatusBadRequest)

	stored, _ := repositories.NewShoppingListRepository(nil).GetShoppingListItemById(item.ID)
	if !stored.IsChecked {
		t.Error("an empty body must not un-check the item")
	}
}

func TestShoppingListReAddingCrossedOffItemRevivesIt(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	milk := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk","quantity":"1 l","note":"lactose free"}`)
	setShoppingListItemCheckedForTest(t, 1, milk.ID, true)

	revived := addShoppingListItemForTest(t, 1, list.ID, `{"name":"  mILK ","quantity":"2 l"}`)

	if revived.ID != milk.ID {
		t.Fatalf("expected the crossed-off item to be revived, got a new item %+v", revived)
	}
	if revived.IsChecked || revived.CheckedAt != nil {
		t.Errorf("expected the revived item to be un-checked, got %+v", revived)
	}
	if revived.Name != "Milk" || revived.Quantity != "2 l" || revived.Note != "lactose free" {
		t.Errorf("expected original name, new quantity and kept note, got %+v", revived)
	}

	// The same name while the item is still on the list is a second line, not a revival.
	second := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)
	if second.ID == milk.ID {
		t.Error("an unchecked match must not be deduplicated")
	}

	lists := getShoppingListsForTest(t, 1, "1")
	if len(lists[0].Items) != 2 {
		t.Errorf("expected 2 items, got %+v", lists[0].Items)
	}
}

func TestShoppingListItemAmountAndUnit(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")

	w, r := shoppingListRequest("POST", `{"name":"Flour","amount":"1.5","unit":"kg"}`, 1, map[string]string{"listId": fmt.Sprint(list.ID)})
	AddShoppingListItem(w, r)
	assertStatus(t, w, http.StatusOK)
	// Decimals travel as strings, like every other amount in the API.
	if !strings.Contains(w.Body.String(), `"amount":"1.5"`) || !strings.Contains(w.Body.String(), `"unit":"kg"`) {
		t.Errorf("expected amount and unit in the response, got %s", w.Body.String())
	}
	flour := decodeShoppingListResponse[models.ShoppingListItem](t, w)

	// An item without an amount sends null and an empty unit, never a missing key.
	plain := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Salt"}`)
	if plain.Amount != nil || plain.Unit != "" {
		t.Errorf("expected no amount, got %+v", plain)
	}

	// Editing to clear the amount persists the null.
	w, r = shoppingListRequest("PUT", `{"name":"Flour"}`, 1, map[string]string{"itemId": fmt.Sprint(flour.ID)})
	UpdateShoppingListItem(w, r)
	assertStatus(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), `"amount":null`) {
		t.Errorf("expected a cleared amount, got %s", w.Body.String())
	}

	w, r = shoppingListRequest("POST", `{"name":"Sugar","unit":"gallon","amount":"1"}`, 1, map[string]string{"listId": fmt.Sprint(list.ID)})
	AddShoppingListItem(w, r)
	assertStatus(t, w, http.StatusBadRequest)
}

func TestShoppingListRevivingWithAnAmountReplacesTheOldQuantity(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	milk := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk","quantity":"a carton"}`)
	setShoppingListItemCheckedForTest(t, 1, milk.ID, true)

	revived := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk","amount":"2","unit":"l"}`)
	if revived.ID != milk.ID || revived.Amount == nil || revived.Amount.String() != "2" || revived.Unit != "l" || revived.Quantity != "" {
		t.Errorf("expected the amount to replace the free-text quantity, got %+v", revived)
	}

	// Reviving without an amount keeps the one it had.
	setShoppingListItemCheckedForTest(t, 1, milk.ID, true)
	again := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)
	if again.Amount == nil || again.Amount.String() != "2" || again.Unit != "l" {
		t.Errorf("expected the amount to be kept, got %+v", again)
	}
}

func TestShoppingListUpdateItemAndList(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	item := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk","quantity":"1","note":"x"}`)

	w, r := shoppingListRequest("PUT", `{"name":"Oat milk","quantity":"","note":""}`, 1, map[string]string{"itemId": fmt.Sprint(item.ID)})
	UpdateShoppingListItem(w, r)
	assertStatus(t, w, http.StatusOK)
	updated := decodeShoppingListResponse[models.ShoppingListItem](t, w)
	if updated.Name != "Oat milk" || updated.Quantity != "" || updated.Note != "" {
		t.Errorf("expected cleared quantity and note to persist, got %+v", updated)
	}

	w, r = shoppingListRequest("PUT", `{"name":"Hardware"}`, 1, map[string]string{"listId": fmt.Sprint(list.ID)})
	UpdateShoppingList(w, r)
	assertStatus(t, w, http.StatusOK)
	renamed := decodeShoppingListResponse[models.ShoppingList](t, w)
	if renamed.Name != "Hardware" || len(renamed.Items) != 1 {
		t.Errorf("expected the renamed list with its item, got %+v", renamed)
	}
}

func TestShoppingListClearCheckedAndDeletes(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	milk := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)
	bread := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Bread"}`)
	eggs := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Eggs"}`)
	setShoppingListItemCheckedForTest(t, 1, milk.ID, true)
	setShoppingListItemCheckedForTest(t, 1, bread.ID, true)

	w, r := shoppingListRequest("POST", "", 1, map[string]string{"listId": fmt.Sprint(list.ID)})
	ClearCheckedShoppingListItems(w, r)
	assertStatus(t, w, http.StatusOK)

	lists := getShoppingListsForTest(t, 1, "1")
	if len(lists[0].Items) != 1 || lists[0].Items[0].ID != eggs.ID {
		t.Fatalf("expected only the unchecked item to remain, got %+v", lists[0].Items)
	}

	w, r = shoppingListRequest("DELETE", "", 1, map[string]string{"itemId": fmt.Sprint(eggs.ID)})
	DeleteShoppingListItem(w, r)
	assertStatus(t, w, http.StatusOK)

	addShoppingListItemForTest(t, 1, list.ID, `{"name":"Butter"}`)
	w, r = shoppingListRequest("DELETE", "", 1, map[string]string{"listId": fmt.Sprint(list.ID)})
	DeleteShoppingList(w, r)
	assertStatus(t, w, http.StatusOK)

	var listCount, itemCount int64
	repositories.GetDB().Model(&models.ShoppingList{}).Count(&listCount)
	repositories.GetDB().Model(&models.ShoppingListItem{}).Count(&itemCount)
	if listCount != 0 || itemCount != 0 {
		t.Errorf("expected the list and its items deleted, got %d lists, %d items", listCount, itemCount)
	}
}

func TestShoppingListListsAreScopedToTheirGroup(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	grantAllGroupPerms(t, 4, 2)
	createShoppingListForTest(t, 1, "1", "Group one list")
	createShoppingListForTest(t, 4, "2", "Group two list")

	lists := getShoppingListsForTest(t, 1, "1")
	if len(lists) != 1 || lists[0].Name != "Group one list" {
		t.Errorf("expected only group 1's list, got %+v", lists)
	}
}

func TestShoppingListMutationsPublishToTheGroup(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	hub := services.GetShoppingListHub()
	subscriber := hub.Subscribe(1)
	defer hub.Unsubscribe(subscriber)
	otherGroup := hub.Subscribe(2)
	defer hub.Unsubscribe(otherGroup)

	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	item := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Milk"}`)
	setShoppingListItemCheckedForTest(t, 1, item.ID, true)
	// A no-op re-check must not broadcast.
	setShoppingListItemCheckedForTest(t, 1, item.ID, true)

	w, r := shoppingListRequest("POST", "", 1, map[string]string{"listId": fmt.Sprint(list.ID)})
	ClearCheckedShoppingListItems(w, r)
	assertStatus(t, w, http.StatusOK)

	expected := []models.ShoppingListEventType{
		models.ShoppingListEventListCreated,
		models.ShoppingListEventItemAdded,
		models.ShoppingListEventItemToggled,
		models.ShoppingListEventCheckedCleared,
	}
	for _, want := range expected {
		select {
		case event := <-subscriber.Events:
			if event.Type != want || event.GroupId != 1 {
				t.Errorf("expected %s for group 1, got %+v", want, event)
			}
			if want == models.ShoppingListEventCheckedCleared && (len(event.ItemIds) != 1 || event.ItemIds[0] != item.ID) {
				t.Errorf("expected the cleared item id, got %+v", event.ItemIds)
			}
		case <-time.After(time.Second):
			t.Fatalf("timed out waiting for %s", want)
		}
	}

	select {
	case event := <-subscriber.Events:
		t.Errorf("unexpected extra event %+v", event)
	case event := <-otherGroup.Events:
		t.Errorf("event leaked to another group: %+v", event)
	default:
	}
}

// startShoppingListStreamServer serves the stream over real HTTP (the recorder cannot stream),
// authenticated as userId.
func startShoppingListStreamServer(userId uint) *httptest.Server {
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, withShoppingListClaims(r, userId))
		})
	})
	router.Get("/group/{groupId}/stream", StreamShoppingListEvents)

	return httptest.NewServer(router)
}

// readShoppingListStreamEvent reads frames until one carrying data arrives, skipping comments.
func readShoppingListStreamEvent(t *testing.T, reader *bufio.Reader) (string, models.ShoppingListEvent) {
	t.Helper()

	eventName := ""
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("stream ended before an event arrived: %v", err)
		}
		line = strings.TrimRight(line, "\n")

		switch {
		case strings.HasPrefix(line, "event: "):
			eventName = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			var event models.ShoppingListEvent
			if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &event); err != nil {
				t.Fatalf("decode event: %v", err)
			}
			return eventName, event
		}
	}
}

// waitForShoppingListSubscribers waits until the stream handler has subscribed, so a test does not
// publish before anyone is listening.
func waitForShoppingListSubscribers(t *testing.T, groupId uint, count int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for services.GetShoppingListHub().SubscriberCount(groupId) < count {
		if time.Now().After(deadline) {
			t.Fatal("stream never subscribed")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestShoppingListStreamDeliversEvents(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")

	server := startShoppingListStreamServer(1)
	defer server.Close()

	response, err := http.Get(server.URL + "/group/1/stream")
	if err != nil {
		t.Fatalf("open stream: %v", err)
	}
	defer response.Body.Close()

	assertStreamHeaders(t, response)
	waitForShoppingListSubscribers(t, 1, 1)

	_, err = services.NewShoppingListService(nil).AddShoppingListItem(1, list.ID, commands.UpsertShoppingListItemCommand{Name: "Milk"}, 1)
	if err != nil {
		t.Fatalf("add item: %v", err)
	}

	name, event := readShoppingListStreamEvent(t, bufio.NewReader(response.Body))
	if name != string(models.ShoppingListEventItemAdded) || event.Item == nil || event.Item.Name != "Milk" {
		t.Errorf("expected ITEM_ADDED for Milk, got %s %+v", name, event)
	}
}

func assertStreamHeaders(t *testing.T, response *http.Response) {
	t.Helper()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}
	if response.Header.Get("Content-Type") != "text/event-stream" {
		t.Errorf("unexpected content type %q", response.Header.Get("Content-Type"))
	}
	if response.Header.Get("X-Accel-Buffering") != "no" {
		t.Error("expected X-Accel-Buffering: no, or nginx would buffer the stream")
	}
}

func TestShoppingListStreamRequiresReadPermission(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	// User 1 is a member of group 1 without shopping-list read.

	server := startShoppingListStreamServer(1)
	defer server.Close()

	response, err := http.Get(server.URL + "/group/1/stream")
	if err != nil {
		t.Fatalf("open stream: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", response.StatusCode)
	}
}

func TestShoppingListStreamEndsAtMaxLifetime(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	previous := shoppingListStreamMaxLifetime
	shoppingListStreamMaxLifetime = 200 * time.Millisecond
	defer func() { shoppingListStreamMaxLifetime = previous }()

	assertShoppingListStreamCloses(t, 1, nil)
}

func TestShoppingListStreamEndsWhenPermissionIsRevoked(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	previous := shoppingListStreamHeartbeat
	shoppingListStreamHeartbeat = 50 * time.Millisecond
	defer func() { shoppingListStreamHeartbeat = previous }()

	assertShoppingListStreamCloses(t, 1, func() {
		repositories.GetDB().Where("user_id = ? AND group_id = ?", 1, 1).Delete(&models.GroupMember{})
		services.ClearRolePermissionCacheForTests()
	})
}

// assertShoppingListStreamCloses opens a stream, runs afterOpen, and expects the server to end the
// response on its own within a few seconds.
func assertShoppingListStreamCloses(t *testing.T, userId uint, afterOpen func()) {
	t.Helper()

	server := startShoppingListStreamServer(userId)
	defer server.Close()

	response, err := http.Get(server.URL + "/group/1/stream")
	if err != nil {
		t.Fatalf("open stream: %v", err)
	}
	defer response.Body.Close()
	assertStreamHeaders(t, response)

	if afterOpen != nil {
		waitForShoppingListSubscribers(t, 1, 1)
		afterOpen()
	}

	ended := make(chan struct{})
	go func() {
		reader := bufio.NewReader(response.Body)
		for {
			if _, err := reader.ReadString('\n'); err != nil {
				close(ended)
				return
			}
		}
	}()

	select {
	case <-ended:
	case <-time.After(3 * time.Second):
		t.Fatal("expected the server to end the stream")
	}

	// The handler unsubscribes on its way out.
	deadline := time.Now().Add(time.Second)
	for services.GetShoppingListHub().SubscriberCount(1) != 0 {
		if time.Now().After(deadline) {
			t.Fatal("stream ended without unsubscribing")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestSetShoppingListItemClassification(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	item := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Strawberries"}`)
	params := map[string]string{"itemId": fmt.Sprint(item.ID)}

	hub := services.GetShoppingListHub()
	subscriber := hub.Subscribe(1)
	defer hub.Unsubscribe(subscriber)

	w, r := shoppingListRequest("PUT", `{"health":"HEALTHY","seasonality":"OUT_OF_SEASON"}`, 1, params)
	SetShoppingListItemClassification(w, r)
	assertStatus(t, w, http.StatusOK)
	updated := decodeShoppingListResponse[models.ShoppingListItem](t, w)
	if updated.Health != models.HEALTH_HEALTHY || updated.Seasonality != models.SEASONALITY_OUT_OF_SEASON {
		t.Errorf("expected the correction applied, got %+v", updated.FoodClassification)
	}

	select {
	case event := <-subscriber.Events:
		if event.Type != models.ShoppingListEventItemUpdated || event.Item == nil || event.Item.Health != models.HEALTH_HEALTHY {
			t.Errorf("expected an ITEM_UPDATED carrying the tags, got %+v", event)
		}
	case <-time.After(time.Second):
		t.Error("expected the correction to be broadcast")
	}

	w, r = shoppingListRequest("PUT", `{"health":"HEALTHY","seasonality":"WINTER"}`, 1, params)
	SetShoppingListItemClassification(w, r)
	assertStatus(t, w, http.StatusBadRequest)

	// Another group's member cannot correct it.
	grantAllGroupPerms(t, 4, 2)
	w, r = shoppingListRequest("PUT", `{"health":"MEDIUM"}`, 4, params)
	SetShoppingListItemClassification(w, r)
	assertStatus(t, w, http.StatusForbidden)
}
