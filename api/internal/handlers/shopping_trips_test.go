package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"fmt"
	"net/http"
	"testing"
)

func attachTripForTest(userId uint, listId uint, receiptId uint) (int, string) {
	w, r := shoppingListRequest("POST", fmt.Sprintf(`{"receiptId":%d}`, receiptId), userId, map[string]string{"listId": fmt.Sprint(listId)})
	AttachShoppingTripReceipt(w, r)
	return w.Code, w.Body.String()
}

func TestAttachShoppingTripAuthorizesTheListAndTheReceipt(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	receipt := seedProductReceipt(t, 1, false)
	otherGroupReceipt := seedProductReceipt(t, 2, false)

	if code, _ := attachTripForTest(1, list.ID, otherGroupReceipt.ID); code != http.StatusForbidden {
		t.Errorf("expected a receipt of a group the user is not in to be refused with 403, got %d", code)
	}
	if code, _ := attachTripForTest(1, list.ID, 999); code != http.StatusForbidden {
		t.Errorf("expected an unknown receipt to look like a denial, got %d", code)
	}

	grantAllGroupPerms(t, 1, 2)
	if code, _ := attachTripForTest(1, list.ID, otherGroupReceipt.ID); code != http.StatusBadRequest {
		t.Errorf("expected another group's receipt to be refused with 400, got %d", code)
	}

	if code, body := attachTripForTest(1, list.ID, receipt.ID); code != http.StatusOK {
		t.Fatalf("expected the attach to succeed, got %d %s", code, body)
	}
	if code, _ := attachTripForTest(1, list.ID, receipt.ID); code != http.StatusBadRequest {
		t.Errorf("expected a receipt already on a list to be refused, got %d", code)
	}

	w, r := shoppingListRequest("POST", `{}`, 1, map[string]string{"listId": fmt.Sprint(list.ID)})
	AttachShoppingTripReceipt(w, r)
	assertStatus(t, w, http.StatusBadRequest)
}

func TestShoppingTripsNeedReceiptAccess(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	grantGroupPerms(t, 2, 1, permissions.GroupShoppingListsRead, permissions.GroupShoppingListsUpdate)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")
	receipt := seedProductReceipt(t, 1, false)
	listParams := map[string]string{"listId": fmt.Sprint(list.ID)}

	if code, _ := attachTripForTest(2, list.ID, receipt.ID); code != http.StatusForbidden {
		t.Errorf("expected attaching without receipt access to be refused, got %d", code)
	}
	if code, body := attachTripForTest(1, list.ID, receipt.ID); code != http.StatusOK {
		t.Fatalf("attach: %d %s", code, body)
	}

	w, r := shoppingListRequest("GET", "", 2, listParams)
	GetShoppingTrips(w, r)
	assertStatus(t, w, http.StatusForbidden)

	w, r = shoppingListRequest("GET", "", 1, listParams)
	GetShoppingTrips(w, r)
	assertStatus(t, w, http.StatusOK)
	trips := decodeShoppingListResponse[[]structs.ShoppingTripView](t, w)
	if len(trips) != 1 || trips[0].Receipt == nil || trips[0].Receipt.Id != receipt.ID || trips[0].UnplannedProducts == nil {
		t.Fatalf("expected the attached receipt, with an empty unplanned list, got %+v", trips)
	}

	tripParams := map[string]string{"tripId": fmt.Sprint(trips[0].Id)}
	w, r = shoppingListRequest("POST", "", 1, tripParams)
	RetryShoppingTrip(w, r)
	assertStatus(t, w, http.StatusBadRequest)

	w, r = shoppingListRequest("DELETE", "", 3, tripParams)
	DetachShoppingTrip(w, r)
	assertStatus(t, w, http.StatusForbidden)

	w, r = shoppingListRequest("DELETE", "", 1, map[string]string{"tripId": "999"})
	DetachShoppingTrip(w, r)
	assertStatus(t, w, http.StatusForbidden)

	w, r = shoppingListRequest("DELETE", "", 1, tripParams)
	DetachShoppingTrip(w, r)
	assertStatus(t, w, http.StatusOK)

	var remaining int64
	repositories.GetDB().Model(&models.ShoppingTrip{}).Count(&remaining)
	if remaining != 0 {
		t.Errorf("expected the trip detached, %d left", remaining)
	}
}

func TestUploadShoppingTripPhotoNeedsQuickScan(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	grantGroupPerms(t, 2, 1, permissions.GroupShoppingListsRead, permissions.GroupShoppingListsUpdate)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")

	w, r := shoppingListRequest("POST", "", 2, map[string]string{"listId": fmt.Sprint(list.ID)})
	UploadShoppingTripPhoto(w, r)
	assertStatus(t, w, http.StatusForbidden)

	w, r = shoppingListRequest("POST", "", 1, map[string]string{"listId": fmt.Sprint(list.ID)})
	UploadShoppingTripPhoto(w, r)
	assertStatus(t, w, http.StatusBadRequest)
}
