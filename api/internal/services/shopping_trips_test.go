package services

import (
	"errors"
	"os"
	"path/filepath"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func TestParseTripComparisonResponse(t *testing.T) {
	matches, err := parseTripComparisonResponse(`{"products": [
		{"id": "1", "listItemId": "2"},
		{"id": 2, "listItemId": null},
		{"id": "3", "listItemId": 9},
		{"id": "7", "listItemId": "1"}
	]}`, 3, 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 1 || matches[0] != 1 {
		t.Errorf("expected only product 1 matched, to item 2, got %v", matches)
	}

	if _, err := parseTripComparisonResponse(`{"products": [{"id": "1", "listItemId": "1"}]}`, 2, 1); err == nil {
		t.Error("expected an answer leaving out a product to be rejected")
	}
	if _, err := parseTripComparisonResponse(`{"items": []}`, 1, 1); err == nil {
		t.Error("expected the wrong shape to be rejected")
	}
}

func TestTripScanBackoffDoublesUpToACap(t *testing.T) {
	expected := map[int]time.Duration{1: time.Hour, 2: 2 * time.Hour, 3: 4 * time.Hour, 5: 12 * time.Hour, 40: 12 * time.Hour}
	for attempts, backoff := range expected {
		if got := shoppingTripScanBackoff(attempts); got != backoff {
			t.Errorf("attempt %d: expected %v, got %v", attempts, backoff, got)
		}
	}
}

type tripFixture struct {
	list    models.ShoppingList
	receipt models.Receipt
	milk    models.ShoppingListItem
}

// seedTripFixture creates group 1 with a list holding an open item ("Milk"), an item crossed off an
// hour ago ("Bread") and one crossed off a month ago ("Old"), plus a receipt dated today.
func seedTripFixture(t *testing.T) tripFixture {
	t.Helper()
	repositories.CreateTestGroupWithUsers()
	db := repositories.GetDB()

	list := models.ShoppingList{GroupId: 1, Name: "Supermarket"}
	if err := db.Create(&list).Error; err != nil {
		t.Fatalf("seed list: %v", err)
	}

	hourAgo := time.Now().Add(-time.Hour)
	monthAgo := time.Now().AddDate(0, -1, 0)
	milk := models.ShoppingListItem{ShoppingListId: list.ID, Name: "Milk"}
	items := []models.ShoppingListItem{
		{ShoppingListId: list.ID, Name: "Bread", IsChecked: true, CheckedAt: &hourAgo},
		{ShoppingListId: list.ID, Name: "Old", IsChecked: true, CheckedAt: &monthAgo},
	}
	if err := db.Create(&milk).Error; err != nil {
		t.Fatalf("seed item: %v", err)
	}
	if err := db.Create(&items).Error; err != nil {
		t.Fatalf("seed items: %v", err)
	}

	today := time.Now().UTC()
	receipt := models.Receipt{
		Name:         "Supermarket",
		Amount:       decimal.RequireFromString("12.50"),
		Date:         time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC),
		PaidByUserID: 1,
		GroupId:      1,
		Status:       models.OPEN,
	}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}

	return tripFixture{list: list, receipt: receipt, milk: milk}
}

func readTrip(t *testing.T, tripId uint) models.ShoppingTrip {
	t.Helper()
	trip, err := repositories.NewShoppingTripRepository(nil).GetTripById(tripId)
	if err != nil {
		t.Fatalf("read trip: %v", err)
	}
	return trip
}

// seedReadProducts stores products for the receipt as a finished read.
func seedReadProducts(t *testing.T, receiptId uint, products []models.ReceiptProduct) []models.ReceiptProduct {
	t.Helper()
	repository := repositories.NewReceiptProductRepository(nil)
	if err := repository.MarkReceiptProductsPending(receiptId); err != nil {
		t.Fatalf("queue: %v", err)
	}
	if err := repository.ReplaceProducts(receiptId, products); err != nil {
		t.Fatalf("replace: %v", err)
	}
	stored, _, err := repository.GetReceiptProducts(receiptId)
	if err != nil {
		t.Fatalf("get products: %v", err)
	}
	return stored
}

func TestAttachReceiptSnapshotsWhatWasPlanned(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedTripFixture(t)
	service := NewShoppingTripService(nil)

	trip, err := service.AttachReceipt(1, fixture.list.ID, fixture.receipt.ID, 1)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}

	names := []string{}
	for _, item := range trip.GetPlannedItems() {
		names = append(names, item.Name)
	}
	if len(names) != 2 || names[0] != "Milk" || names[1] != "Bread" {
		t.Errorf("expected the open item and the one crossed off today, got %v", names)
	}
	if trip.Status != models.SHOPPING_TRIP_PENDING {
		t.Errorf("expected a pending trip, got %s", trip.Status)
	}

	extraction, err := repositories.NewReceiptProductRepository(nil).GetExtraction(fixture.receipt.ID)
	if err != nil || extraction.Status != models.PRODUCT_EXTRACTION_PENDING {
		t.Errorf("expected the receipt queued for reading, got %+v (%v)", extraction, err)
	}

	if _, err := service.AttachReceipt(1, fixture.list.ID, fixture.receipt.ID, 1); !errors.Is(err, ErrReceiptAlreadyOnTrip) {
		t.Errorf("expected a second attach to be refused, got %v", err)
	}

	otherGroupList := models.ShoppingList{GroupId: 2, Name: "Other"}
	repositories.GetDB().Create(&otherGroupList)
	if _, err := service.AttachReceipt(2, otherGroupList.ID, fixture.receipt.ID, 1); !errors.Is(err, ErrTripReceiptInOtherGroup) {
		t.Errorf("expected another group's receipt to be refused, got %v", err)
	}
}

func TestAttachingKeepsProductsAlreadyRead(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedTripFixture(t)
	seedReadProducts(t, fixture.receipt.ID, []models.ReceiptProduct{{ReceiptId: fixture.receipt.ID, Name: "LAIT"}})

	if _, err := NewShoppingTripService(nil).AttachReceipt(1, fixture.list.ID, fixture.receipt.ID, 1); err != nil {
		t.Fatalf("attach: %v", err)
	}

	extraction, _ := repositories.NewReceiptProductRepository(nil).GetExtraction(fixture.receipt.ID)
	if extraction.Status != models.PRODUCT_EXTRACTION_DONE {
		t.Errorf("attaching must not re-read products already read, got %s", extraction.Status)
	}
}

func TestATripWaitsForItsReceiptsProducts(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedTripFixture(t)
	trip, err := NewShoppingTripService(nil).AttachReceipt(1, fixture.list.ID, fixture.receipt.ID, 1)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}

	if _, err := NewShoppingTripService(nil).ProcessDueTrips(); err != nil {
		t.Fatalf("process: %v", err)
	}

	waiting := readTrip(t, trip.ID)
	if waiting.Status != models.SHOPPING_TRIP_PENDING || !waiting.NextAttemptAt.After(time.Now()) || waiting.Attempts != 0 {
		t.Errorf("expected the trip to wait for the products without counting an attempt, got %+v", waiting)
	}
}

func TestATripOnAnEmptyListMarksEverythingUnplanned(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestGroupWithUsers()
	db := repositories.GetDB()
	list := models.ShoppingList{GroupId: 1, Name: "Empty"}
	db.Create(&list)
	receipt := models.Receipt{Name: "Petrol", Amount: decimal.RequireFromString("60"), Date: time.Now(), PaidByUserID: 1, GroupId: 1, Status: models.OPEN}
	db.Create(&receipt)

	crisps := decimal.RequireFromString("2.49")
	fuel := decimal.RequireFromString("57.51")
	seedReadProducts(t, receipt.ID, []models.ReceiptProduct{
		{ReceiptId: receipt.ID, Name: "CHIPS", DisplayName: "Crisps", Amount: &crisps},
		{ReceiptId: receipt.ID, Name: "SP95", Amount: &fuel, Position: 1},
	})

	service := NewShoppingTripService(nil)
	trip, err := service.AttachReceipt(1, list.ID, receipt.ID, 1)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if _, err := service.ProcessDueTrips(); err != nil {
		t.Fatalf("process: %v", err)
	}

	if done := readTrip(t, trip.ID); done.Status != models.SHOPPING_TRIP_DONE {
		t.Fatalf("expected the trip done without asking the AI, got %+v", done)
	}

	views, err := service.GetTripsForList(list.ID, 1)
	if err != nil || len(views) != 1 {
		t.Fatalf("expected one trip, got %+v (%v)", views, err)
	}
	view := views[0]
	if view.UnplannedAmount == nil || view.UnplannedAmount.String() != "60" || len(view.UnplannedProducts) != 2 || view.UnplannedProducts[0] != "Crisps" {
		t.Errorf("expected everything unplanned, got %+v", view)
	}
	if view.Receipt == nil || view.Receipt.Name != "Petrol" || view.ProductCount != 2 {
		t.Errorf("expected the receipt shown, got %+v", view)
	}
}

func TestATripWaitsOutAMissingAiAndCountsAsPlanned(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedTripFixture(t)
	products := seedReadProducts(t, fixture.receipt.ID, []models.ReceiptProduct{{ReceiptId: fixture.receipt.ID, Name: "LAIT"}})
	service := NewShoppingTripService(nil)
	trip, err := service.AttachReceipt(1, fixture.list.ID, fixture.receipt.ID, 1)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}

	if _, err := service.ProcessDueTrips(); err != nil {
		t.Fatalf("process: %v", err)
	}

	waiting := readTrip(t, trip.ID)
	if waiting.Status != models.SHOPPING_TRIP_UNAVAILABLE || waiting.Attempts != 0 || waiting.LastError == "" {
		t.Errorf("expected the trip to wait for the AI without counting an attempt, got %+v", waiting)
	}

	var product models.ReceiptProduct
	repositories.GetDB().First(&product, products[0].ID)
	if product.Planned != nil {
		t.Errorf("an uncompared product must stay unmarked, which counts as planned; got %v", *product.Planned)
	}
}

func TestReReadingProductsComparesTheTripAgainAndDetachClearsMarks(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedTripFixture(t)
	db := repositories.GetDB()
	emptyList := models.ShoppingList{GroupId: 1, Name: "Empty"}
	db.Create(&emptyList)
	seedReadProducts(t, fixture.receipt.ID, []models.ReceiptProduct{{ReceiptId: fixture.receipt.ID, Name: "LAIT"}})

	service := NewShoppingTripService(nil)
	trip, err := service.AttachReceipt(1, emptyList.ID, fixture.receipt.ID, 1)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if _, err := service.ProcessDueTrips(); err != nil {
		t.Fatalf("process: %v", err)
	}

	productRepository := repositories.NewReceiptProductRepository(nil)
	if err := productRepository.ReplaceProducts(fixture.receipt.ID, []models.ReceiptProduct{{ReceiptId: fixture.receipt.ID, Name: "PAIN"}}); err != nil {
		t.Fatalf("re-read: %v", err)
	}
	if requeued := readTrip(t, trip.ID); requeued.Status != models.SHOPPING_TRIP_PENDING {
		t.Errorf("expected a re-read to send the trip back for comparison, got %s", requeued.Status)
	}

	if _, err := service.ProcessDueTrips(); err != nil {
		t.Fatalf("process again: %v", err)
	}
	products, _, _ := productRepository.GetReceiptProducts(fixture.receipt.ID)
	if len(products) != 1 || products[0].Planned == nil || *products[0].Planned {
		t.Fatalf("expected the re-read product marked unplanned, got %+v", products)
	}

	if err := service.DetachTrip(1, trip.ID); err != nil {
		t.Fatalf("detach: %v", err)
	}
	products, _, _ = productRepository.GetReceiptProducts(fixture.receipt.ID)
	if products[0].Planned != nil {
		t.Error("expected detaching to clear the product's mark")
	}
	if _, err := repositories.NewShoppingTripRepository(nil).GetTripById(trip.ID); err == nil {
		t.Error("expected the trip gone")
	}
}

func TestAnUploadedPhotoWaitsForTheAiAndIsRemovedWithItsList(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedTripFixture(t)
	// The signature is all the file-type check reads; the photo is never decoded without an AI.
	png := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")

	service := NewShoppingTripService(nil)
	trip, err := service.UploadPhoto(1, fixture.list.ID, png, "../receipt.png", 1)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer os.RemoveAll(filepath.Dir(trip.PhotoPath))
	if trip.PhotoName != "receipt.png" {
		t.Errorf("expected the file name stripped of any path, got %q", trip.PhotoName)
	}
	if _, err := os.Stat(trip.PhotoPath); err != nil {
		t.Fatalf("expected the photo stored: %v", err)
	}

	if _, err := service.ProcessDueTrips(); err != nil {
		t.Fatalf("process: %v", err)
	}
	waiting := readTrip(t, trip.ID)
	if waiting.Status != models.SHOPPING_TRIP_UNAVAILABLE || waiting.ReceiptId != nil || waiting.Attempts != 0 {
		t.Errorf("expected the photo to wait for the AI, got %+v", waiting)
	}

	if err := NewShoppingListService(nil).DeleteShoppingList(1, fixture.list.ID); err != nil {
		t.Fatalf("delete list: %v", err)
	}
	if _, err := os.Stat(trip.PhotoPath); !os.IsNotExist(err) {
		t.Errorf("expected the photo removed with its list, got %v", err)
	}

	if _, err := service.UploadPhoto(1, fixture.list.ID, []byte("not an image"), "notes.txt", 1); !errors.Is(err, ErrTripPhotoInvalid) {
		t.Errorf("expected a non-image to be refused, got %v", err)
	}
}

func TestRetryOnlyRequeuesAFailedTrip(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedTripFixture(t)
	service := NewShoppingTripService(nil)
	trip, err := service.AttachReceipt(1, fixture.list.ID, fixture.receipt.ID, 1)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}

	if err := service.RetryTrip(1, trip.ID); !errors.Is(err, ErrTripNotFailed) {
		t.Errorf("expected a pending trip not to be retried, got %v", err)
	}

	productRepository := repositories.NewReceiptProductRepository(nil)
	productRepository.UpdateExtraction(fixture.receipt.ID, models.PRODUCT_EXTRACTION_FAILED, time.Now(), 3, "unreadable")
	if _, err := service.ProcessDueTrips(); err != nil {
		t.Fatalf("process: %v", err)
	}
	if failed := readTrip(t, trip.ID); failed.Status != models.SHOPPING_TRIP_FAILED {
		t.Fatalf("expected the trip to fail with its products, got %+v", failed)
	}

	if err := service.RetryTrip(1, trip.ID); err != nil {
		t.Fatalf("retry: %v", err)
	}
	if retried := readTrip(t, trip.ID); retried.Status != models.SHOPPING_TRIP_PENDING {
		t.Errorf("expected the trip pending again, got %s", retried.Status)
	}
	if extraction, _ := productRepository.GetExtraction(fixture.receipt.ID); extraction.Status != models.PRODUCT_EXTRACTION_PENDING {
		t.Errorf("expected the failed product read queued again, got %s", extraction.Status)
	}
}
