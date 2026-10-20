package handlers

import (
	"fmt"
	"net/http"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/permissions"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/services"
	"receipt-wrangler/api/internal/structs"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func tearDownReceiptProductsTest() {
	repositories.TruncateTestDb()
	services.ClearRolePermissionCacheForTests()
}

func seedProductReceipt(t *testing.T, groupId uint, withImage bool) models.Receipt {
	t.Helper()
	receipt := models.Receipt{
		Name:         "Supermarket",
		Amount:       decimal.RequireFromString("9.99"),
		Date:         time.Now(),
		PaidByUserID: 1,
		GroupId:      groupId,
		Status:       models.OPEN,
	}
	if err := repositories.GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}
	if withImage {
		image := models.FileData{Name: "receipt.jpg", FileType: "image/jpeg", ReceiptId: receipt.ID}
		if err := repositories.GetDB().Create(&image).Error; err != nil {
			t.Fatalf("seed image: %v", err)
		}
	}
	return receipt
}

func TestReceiptProductsReportsNotQueuedThenTheProducts(t *testing.T) {
	defer tearDownReceiptProductsTest()
	repositories.CreateTestGroupWithUsers()
	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsRead)
	receipt := seedProductReceipt(t, 1, false)
	params := map[string]string{"receiptId": fmt.Sprint(receipt.ID)}

	w, r := shoppingListRequest("GET", "", 1, params)
	GetReceiptProducts(w, r)
	assertStatus(t, w, http.StatusOK)
	view := decodeShoppingListResponse[structs.ReceiptProductsView](t, w)
	if view.Status != "NOT_QUEUED" || view.Products == nil || len(view.Products) != 0 {
		t.Errorf("expected NOT_QUEUED with an empty list, got %+v", view)
	}

	repository := repositories.NewReceiptProductRepository(nil)
	if err := repository.MarkReceiptProductsPending(receipt.ID); err != nil {
		t.Fatalf("queue: %v", err)
	}
	if err := repository.ReplaceProducts(receipt.ID, []models.ReceiptProduct{{ReceiptId: receipt.ID, Name: "LAIT", DisplayName: "Milk"}}); err != nil {
		t.Fatalf("replace: %v", err)
	}

	w, r = shoppingListRequest("GET", "", 1, params)
	GetReceiptProducts(w, r)
	assertStatus(t, w, http.StatusOK)
	view = decodeShoppingListResponse[structs.ReceiptProductsView](t, w)
	if view.Status != "DONE" || len(view.Products) != 1 || view.Products[0].DisplayName != "Milk" {
		t.Errorf("expected the read products, got %+v", view)
	}
}

func TestReceiptProductsRequireAccessToTheReceipt(t *testing.T) {
	defer tearDownReceiptProductsTest()
	repositories.CreateTestGroupWithUsers()
	receipt := seedProductReceipt(t, 1, true)
	// User 4 has every permission, but in group 2 only.
	grantAllGroupPerms(t, 4, 2)

	for name, handler := range map[string]func(http.ResponseWriter, *http.Request){
		"get":  GetReceiptProducts,
		"read": ReadReceiptProducts,
	} {
		w, r := shoppingListRequest("POST", "", 4, map[string]string{"receiptId": fmt.Sprint(receipt.ID)})
		handler(w, r)
		if w.Result().StatusCode != http.StatusForbidden {
			t.Errorf("%s: expected 403, got %d", name, w.Result().StatusCode)
		}
	}
}

func TestReadReceiptProductsQueuesARead(t *testing.T) {
	defer tearDownReceiptProductsTest()
	repositories.CreateTestGroupWithUsers()
	receipt := seedProductReceipt(t, 1, true)
	params := map[string]string{"receiptId": fmt.Sprint(receipt.ID)}

	// Reading products needs update, not just read. Two members, because grantGroupPerms names its
	// role after the (user, group) pair and so can grant each pair only once.
	grantGroupPerms(t, 2, 1, permissions.GroupReceiptsRead)
	w, r := shoppingListRequest("POST", "", 2, params)
	ReadReceiptProducts(w, r)
	assertStatus(t, w, http.StatusForbidden)

	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate)
	w, r = shoppingListRequest("POST", "", 1, params)
	ReadReceiptProducts(w, r)
	assertStatus(t, w, http.StatusOK)

	if view := decodeShoppingListResponse[structs.ReceiptProductsView](t, w); view.Status != "PENDING" {
		t.Errorf("expected PENDING, got %+v", view)
	}
}

func TestBackfillQueuesOnlyUnreadReceiptsWithImages(t *testing.T) {
	defer tearDownReceiptProductsTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	withImage := seedProductReceipt(t, 1, true)
	seedProductReceipt(t, 1, true)
	seedProductReceipt(t, 1, false)
	seedProductReceipt(t, 2, true) // another group
	// Already queued: not queued again.
	if err := repositories.NewReceiptProductRepository(nil).MarkReceiptProductsPending(withImage.ID); err != nil {
		t.Fatalf("queue: %v", err)
	}

	w, r := shoppingListRequest("POST", "", 1, map[string]string{"groupId": "1"})
	QueueGroupReceiptProducts(w, r)
	assertStatus(t, w, http.StatusOK)
	if view := decodeShoppingListResponse[structs.QueuedReceiptsView](t, w); view.Queued != 1 {
		t.Errorf("expected exactly 1 receipt queued, got %d", view.Queued)
	}

	// Running it again finds nothing new.
	w, r = shoppingListRequest("POST", "", 1, map[string]string{"groupId": "1"})
	QueueGroupReceiptProducts(w, r)
	if view := decodeShoppingListResponse[structs.QueuedReceiptsView](t, w); view.Queued != 0 {
		t.Errorf("expected nothing left to queue, got %d", view.Queued)
	}
}

func TestBackfillRejectsTheAllGroup(t *testing.T) {
	defer tearDownReceiptProductsTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	repositories.GetDB().Model(&models.Group{}).Where("id = ?", 1).Update("is_all_group", true)

	w, r := shoppingListRequest("POST", "", 1, map[string]string{"groupId": "1"})
	QueueGroupReceiptProducts(w, r)
	assertStatus(t, w, http.StatusBadRequest)
}

func TestSetReceiptProductClassification(t *testing.T) {
	defer tearDownReceiptProductsTest()
	repositories.CreateTestGroupWithUsers()
	receipt := seedProductReceipt(t, 1, true)
	product := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "CHOC NOIR 70%", DisplayName: "Dark chocolate"}
	if err := repositories.GetDB().Create(&product).Error; err != nil {
		t.Fatalf("seed product: %v", err)
	}
	params := map[string]string{"productId": fmt.Sprint(product.ID)}

	// Read alone may not correct.
	grantGroupPerms(t, 2, 1, permissions.GroupReceiptsRead)
	w, r := shoppingListRequest("PUT", `{"health":"MEDIUM"}`, 2, params)
	SetReceiptProductClassification(w, r)
	assertStatus(t, w, http.StatusForbidden)

	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate)
	w, r = shoppingListRequest("PUT", `{"health":"tasty"}`, 1, params)
	SetReceiptProductClassification(w, r)
	assertStatus(t, w, http.StatusBadRequest)

	w, r = shoppingListRequest("PUT", `{"health":"medium"}`, 1, params)
	SetReceiptProductClassification(w, r)
	assertStatus(t, w, http.StatusOK)
	updated := decodeShoppingListResponse[models.ReceiptProduct](t, w)
	if updated.Health != models.HEALTH_MEDIUM || !updated.ClassificationOverridden {
		t.Errorf("expected the correction applied, got %+v", updated.FoodClassification)
	}

	corrections, _ := repositories.NewFoodClassificationRepository(nil).CorrectionsForGroup(1)
	if corrections["dark chocolate"] != models.HEALTH_MEDIUM {
		t.Errorf("expected the display name remembered, got %v", corrections)
	}

	// An unknown product looks like a denial.
	w, r = shoppingListRequest("PUT", `{"health":"MEDIUM"}`, 1, map[string]string{"productId": "9999"})
	SetReceiptProductClassification(w, r)
	assertStatus(t, w, http.StatusForbidden)
}
