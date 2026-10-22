package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

const (
	// Trips one sweep works on at most.
	shoppingTripBatchSize = 5
	// How long a trip waits before looking again at a receipt whose products are still being read.
	shoppingTripWaitForProducts = 5 * time.Minute
	// How long a trip waits after the AI could not be reached before trying again.
	shoppingTripRetryAfterOutage = time.Hour
	// How long a trip waits after an unreadable comparison before trying again.
	shoppingTripRetryAfterBadAnswer = 10 * time.Minute
	// Unreadable comparisons allowed before giving up.
	shoppingTripMaxBadAnswers = 3
	// A failed scan of a photo waits an hour, doubling each time, up to this long.
	shoppingTripMaxScanBackoff = 12 * time.Hour
	// After this long without success, a trip stops being retried.
	shoppingTripRetryWindow = 14 * 24 * time.Hour
	// Items crossed off this long before attaching count as bought on this trip.
	shoppingTripCheckedWindow = 24 * time.Hour
	// Trips a list shows, newest first.
	shoppingTripsShownPerList = 20
	// The folder, inside the data directory, holding photos that wait to become receipts.
	shoppingTripPhotoFolder = "shopping-trips"
)

var (
	ErrTripReceiptInOtherGroup = errors.New("the receipt belongs to another group")
	ErrReceiptAlreadyOnTrip    = errors.New("the receipt is already attached to a shopping list")
	ErrTripPhotoInvalid        = errors.New("the file is not an image or a PDF")
	ErrTripNotFailed           = errors.New("only a trip that failed can be tried again")
)

const shoppingTripComparisonPrompt = `You compare what a household bought with their shopping list.

Shopping list (what they planned to buy):
%s

Products on the receipt:
%s

For each receipt product, give the id of the shopping list entry it is, or null if it was not on the list.
A product matches an entry when it is that thing, whatever the brand, size, language or abbreviation: "LAIT DEMI-ECR 1L" is "Milk", "Coca-Cola 1.5L" is "Coke". A general entry covers specific products: "Fruit" covers "Apples". Several products can match one entry.

Return ONLY valid JSON in plain text, never in a code block, exactly in this shape:
{"products": [{"id": "1", "listItemId": "2"}, {"id": "2", "listItemId": null}]}
Return one entry for every receipt product, with the same id.`

type ShoppingTripService struct {
	BaseService
}

func NewShoppingTripService(tx *gorm.DB) ShoppingTripService {
	return ShoppingTripService{BaseService: BaseService{DB: repositories.GetDB(), TX: tx}}
}

// AttachReceipt attaches an existing receipt of the list's group to the list. What counts as planned
// is the list as it stands now: its open items, plus those crossed off from the day of the receipt
// (or the last day, whichever is earlier).
func (service ShoppingTripService) AttachReceipt(groupId uint, listId uint, receiptId uint, userId uint) (models.ShoppingTrip, error) {
	receipt, err := repositories.NewReceiptRepository(service.TX).GetReceiptById(utils.UintToString(receiptId))
	if err != nil {
		return models.ShoppingTrip{}, err
	}
	if receipt.GroupId != groupId {
		return models.ShoppingTrip{}, ErrTripReceiptInOtherGroup
	}

	_, err = repositories.NewShoppingTripRepository(service.TX).GetTripForReceipt(receiptId)
	if err == nil {
		return models.ShoppingTrip{}, ErrReceiptAlreadyOnTrip
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.ShoppingTrip{}, err
	}

	now := time.Now()
	// A receipt's date is a calendar day stored as midnight UTC; it starts at midnight in the app zone.
	date := receipt.Date.UTC()
	receiptDayStart := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, repositories.GetAppLocation())
	checkedSince := now.Add(-shoppingTripCheckedWindow)
	if receiptDayStart.Before(checkedSince) {
		checkedSince = receiptDayStart
	}

	trip, err := service.createTrip(groupId, listId, &receiptId, "", "", checkedSince, userId, now)
	if err != nil {
		return models.ShoppingTrip{}, err
	}

	publishTripsChanged(groupId, listId)
	return trip, nil
}

// UploadPhoto starts a trip from a receipt photo taken while shopping. The photo is kept until the AI
// turns it into a receipt, however long the AI is unavailable (up to the retry window).
func (service ShoppingTripService) UploadPhoto(groupId uint, listId uint, fileBytes []byte, fileName string, userId uint) (models.ShoppingTrip, error) {
	fileType, err := repositories.NewFileRepository(service.TX).ValidateFileType(fileBytes)
	if err != nil {
		return models.ShoppingTrip{}, ErrTripPhotoInvalid
	}

	photoPath, err := writeTripPhoto(fileBytes, fileType)
	if err != nil {
		return models.ShoppingTrip{}, err
	}

	now := time.Now()
	name := truncateRunes(filepath.Base(fileName), 255)
	trip, err := service.createTrip(groupId, listId, nil, photoPath, name, now.Add(-shoppingTripCheckedWindow), userId, now)
	if err != nil {
		os.Remove(photoPath)
		return models.ShoppingTrip{}, err
	}

	publishTripsChanged(groupId, listId)
	return trip, nil
}

func writeTripPhoto(fileBytes []byte, fileType string) (string, error) {
	dataDir, err := utils.GetDataDir()
	if err != nil {
		return "", err
	}

	name, err := utils.GetRandomString(16)
	if err != nil {
		return "", err
	}

	extension := fileType[strings.LastIndex(fileType, "/")+1:]
	folder := filepath.Join(dataDir, shoppingTripPhotoFolder)
	path := filepath.Join(folder, name+"."+extension)
	if err := utils.AssertWithinDataDir(path); err != nil {
		return "", err
	}

	err = os.MkdirAll(folder, os.ModePerm)
	if err != nil {
		return "", err
	}

	return path, os.WriteFile(path, fileBytes, 0644)
}

func (service ShoppingTripService) createTrip(
	groupId uint,
	listId uint,
	receiptId *uint,
	photoPath string,
	photoName string,
	checkedSince time.Time,
	userId uint,
	now time.Time,
) (models.ShoppingTrip, error) {
	var trip models.ShoppingTrip

	err := service.GetDB().Transaction(func(tx *gorm.DB) error {
		items := []models.ShoppingListItem{}
		err := tx.
			Where("shopping_list_id = ? AND (is_checked = ? OR checked_at >= ?)", listId, false, checkedSince).
			Order("created_at ASC").
			Order("id ASC").
			Find(&items).Error
		if err != nil {
			return err
		}

		planned := make([]models.ShoppingTripPlannedItem, len(items))
		for i, item := range items {
			planned[i] = models.ShoppingTripPlannedItem{Id: item.ID, Name: item.Name}
		}

		trip = models.ShoppingTrip{
			BaseModel:      models.BaseModel{CreatedBy: &userId},
			ShoppingListId: listId,
			ReceiptId:      receiptId,
			PhotoPath:      photoPath,
			PhotoName:      photoName,
			Status:         models.SHOPPING_TRIP_PENDING,
			NextAttemptAt:  now,
			QueuedAt:       now,
		}
		trip.SetPlannedItems(planned)

		err = repositories.NewShoppingTripRepository(tx).CreateTrip(&trip)
		if err != nil {
			return err
		}

		if receiptId != nil {
			return repositories.NewReceiptProductRepository(tx).EnsureReceiptProductsQueued(*receiptId)
		}
		return nil
	})

	return trip, err
}

// DetachTrip removes a trip from its list, and its planned marks from the receipt's products. The
// receipt itself stays.
func (service ShoppingTripService) DetachTrip(groupId uint, tripId uint) error {
	trip, err := repositories.NewShoppingTripRepository(service.TX).GetTripById(tripId)
	if err != nil {
		return err
	}

	var photoPaths []string
	err = service.GetDB().Transaction(func(tx *gorm.DB) error {
		var deleteErr error
		photoPaths, deleteErr = repositories.NewShoppingTripRepository(tx).DeleteTrip(tripId)
		return deleteErr
	})
	if err != nil {
		return err
	}

	RemoveTripPhotos(photoPaths)
	publishTripsChanged(groupId, trip.ShoppingListId)
	return nil
}

// RetryTrip gives a failed trip another try, re-reading its receipt's products if that is what failed.
func (service ShoppingTripService) RetryTrip(groupId uint, tripId uint) error {
	repository := repositories.NewShoppingTripRepository(service.TX)
	trip, err := repository.GetTripById(tripId)
	if err != nil {
		return err
	}
	if trip.Status != models.SHOPPING_TRIP_FAILED {
		return ErrTripNotFailed
	}

	if trip.ReceiptId != nil {
		extraction, err := repositories.NewReceiptProductRepository(service.TX).GetExtraction(*trip.ReceiptId)
		if err == nil && extraction.Status == models.PRODUCT_EXTRACTION_FAILED {
			err = RequestReceiptProductRead(*trip.ReceiptId)
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	}

	requeued, err := repository.RequeueFailedTrip(tripId, time.Now())
	if err != nil {
		return err
	}
	if !requeued {
		return ErrTripNotFailed
	}

	publishTripsChanged(groupId, trip.ShoppingListId)
	return nil
}

// RemoveTripPhotos deletes photos of trips that were removed. Best effort: a leftover file only
// takes space.
func RemoveTripPhotos(paths []string) {
	for _, path := range paths {
		if utils.AssertWithinDataDir(path) != nil {
			continue
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "shopping trips: could not remove a photo: "+err.Error())
		}
	}
}

func publishTripsChanged(groupId uint, listId uint) {
	publishShoppingListEvent(models.ShoppingListEvent{
		Type:           models.ShoppingListEventTripsChanged,
		GroupId:        groupId,
		ShoppingListId: listId,
	})
}

// GetTripsForList returns a list's recent trips as the user may see them: a receipt hidden from them
// by their paid-by visibility shows no details and no result.
func (service ShoppingTripService) GetTripsForList(listId uint, userId uint) ([]structs.ShoppingTripView, error) {
	repository := repositories.NewShoppingTripRepository(service.TX)
	trips, err := repository.GetTripsForList(listId, shoppingTripsShownPerList)
	if err != nil {
		return []structs.ShoppingTripView{}, err
	}

	receiptIds := []uint{}
	for _, trip := range trips {
		if trip.ReceiptId != nil {
			receiptIds = append(receiptIds, *trip.ReceiptId)
		}
	}

	receipts := []models.Receipt{}
	if len(receiptIds) > 0 {
		err = service.GetDB().Model(&models.Receipt{}).
			Select("id", "name", "date", "amount", "group_id", "paid_by_user_id").
			Where("id IN ?", receiptIds).
			Find(&receipts).Error
		if err != nil {
			return []structs.ShoppingTripView{}, err
		}
	}

	visible, err := NewPermissionService(service.TX).FilterReceiptsByPaidBy(userId, receipts)
	if err != nil {
		return []structs.ShoppingTripView{}, err
	}
	visibleReceipts := map[uint]models.Receipt{}
	visibleIds := []uint{}
	for _, receipt := range visible {
		visibleReceipts[receipt.ID] = receipt
		visibleIds = append(visibleIds, receipt.ID)
	}

	products, err := repository.GetProductsForReceipts(visibleIds)
	if err != nil {
		return []structs.ShoppingTripView{}, err
	}

	views := make([]structs.ShoppingTripView, len(trips))
	for i, trip := range trips {
		views[i] = buildShoppingTripView(trip, visibleReceipts, products)
	}
	return views, nil
}

func buildShoppingTripView(
	trip models.ShoppingTrip,
	visibleReceipts map[uint]models.Receipt,
	products map[uint][]models.ReceiptProduct,
) structs.ShoppingTripView {
	view := structs.ShoppingTripView{
		Id:                trip.ID,
		ShoppingListId:    trip.ShoppingListId,
		CreatedAt:         trip.CreatedAt,
		Status:            string(trip.Status),
		LastError:         trip.LastError,
		WaitingForPhoto:   trip.ReceiptId == nil,
		PlannedItemCount:  len(trip.GetPlannedItems()),
		UnplannedProducts: []string{},
	}
	if trip.ReceiptId == nil {
		return view
	}

	receipt, ok := visibleReceipts[*trip.ReceiptId]
	if !ok {
		return view
	}
	view.Receipt = &structs.ShoppingTripReceipt{Id: receipt.ID, Name: receipt.Name, Date: receipt.Date, Amount: receipt.Amount}

	if trip.Status != models.SHOPPING_TRIP_DONE {
		return view
	}

	unplanned := decimal.Zero
	for _, product := range products[receipt.ID] {
		view.ProductCount++
		if product.Planned == nil || *product.Planned {
			continue
		}
		if product.Amount != nil {
			unplanned = unplanned.Add(*product.Amount)
		}
		name := product.DisplayName
		if name == "" {
			name = product.Name
		}
		view.UnplannedProducts = append(view.UnplannedProducts, name)
	}
	view.UnplannedAmount = &unplanned

	return view
}

// ProcessDueTrips moves up to a batch of due trips one step on. It is what the periodic sweep runs.
// Each outcome, including an unreachable AI, is recorded on the trip; only a database error is
// returned.
func (service ShoppingTripService) ProcessDueTrips() (int, error) {
	repository := repositories.NewShoppingTripRepository(service.TX)
	processed := 0

	for processed < shoppingTripBatchSize {
		trip, ok, err := repository.ClaimDueTrip(time.Now())
		if err != nil {
			return processed, err
		}
		if !ok {
			break
		}

		groupId, err := repositories.NewShoppingListRepository(service.TX).GetGroupIdForShoppingList(trip.ShoppingListId)
		if err != nil {
			return processed, err
		}

		if trip.ReceiptId == nil {
			err = service.scanPhoto(trip, groupId)
		} else {
			err = service.compare(trip, groupId)
		}
		if err != nil {
			return processed, err
		}

		publishTripsChanged(groupId, trip.ShoppingListId)
		processed++
	}

	return processed, nil
}

// scanPhoto turns a trip's photo into a receipt the way Quick Scan does, with the group's quick-scan
// defaults for who paid and the status.
func (service ShoppingTripService) scanPhoto(trip models.ShoppingTrip, groupId uint) error {
	repository := repositories.NewShoppingTripRepository(service.TX)

	if !utils.FileExists(trip.PhotoPath) || utils.AssertWithinDataDir(trip.PhotoPath) != nil {
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_FAILED, time.Now(), trip.Attempts, "The photo is no longer there; attach the receipt again")
	}
	if trip.CreatedBy == nil {
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_FAILED, time.Now(), trip.Attempts, "The trip has no uploader to create the receipt for")
	}

	// With no AI configured there is nothing to call: wait without recording a failed scan each time.
	processingService, err := NewSystemReceiptProcessingService(service.TX, utils.UintToString(groupId))
	if err != nil || processingService.ReceiptProcessingSettings.ID == 0 {
		return service.recordOutage(trip, errNoAiConfigured)
	}

	settings, err := repositories.NewGroupReceiptSettingsRepository(service.TX).GetGroupReceiptSettingsByGroupId(groupId)
	if err != nil {
		return err
	}
	uploaderId := *trip.CreatedBy
	paidByUserId := resolveQuickScanDefaultPaidBy(settings, uploaderId)
	if paidByUserId == 0 {
		paidByUserId = uploaderId
	}
	status := settings.QuickScanDefaultStatus
	if status == "" {
		status = models.OPEN
	}

	receipt, scanErr := NewReceiptService(service.TX).QuickScan(QuickScanParams{
		Token:            &structs.Claims{UserId: uploaderId},
		PaidByUserId:     paidByUserId,
		GroupId:          groupId,
		Status:           status,
		CategoryIds:      []uint{},
		TagIds:           []uint{},
		TempPath:         trip.PhotoPath,
		OriginalFileName: trip.PhotoName,
	})
	if scanErr != nil {
		return service.recordScanFailure(trip, scanErr)
	}

	return repository.SetTripReceipt(trip.ID, receipt.ID, time.Now())
}

// recordScanFailure waits longer after each failed scan: every attempt that reaches the AI is
// recorded in the group's activity, so an outage of days should not fill it.
func (service ShoppingTripService) recordScanFailure(trip models.ShoppingTrip, scanErr error) error {
	repository := repositories.NewShoppingTripRepository(service.TX)
	attempts := trip.Attempts + 1
	message := truncateRunes("The photo could not be read into a receipt yet: "+scanErr.Error(), 500)

	if time.Since(trip.QueuedAt) > shoppingTripRetryWindow || attempts >= shoppingTripMaxBadAnswers {
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_FAILED, time.Now(), attempts, message)
	}

	return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_UNAVAILABLE, time.Now().Add(shoppingTripScanBackoff(attempts)), attempts, message)
}

func shoppingTripScanBackoff(attempts int) time.Duration {
	backoff := shoppingTripRetryAfterOutage
	for i := 1; i < attempts && backoff < shoppingTripMaxScanBackoff; i++ {
		backoff *= 2
	}
	return min(backoff, shoppingTripMaxScanBackoff)
}

func (service ShoppingTripService) recordOutage(trip models.ShoppingTrip, aiErr error) error {
	repository := repositories.NewShoppingTripRepository(service.TX)
	message := truncateRunes("The AI was not available: "+aiErr.Error(), 500)

	if time.Since(trip.QueuedAt) > shoppingTripRetryWindow {
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_FAILED, time.Now(), trip.Attempts, message)
	}

	// Nothing was called, so nothing is spent: wait for someone to configure the AI.
	if errors.Is(aiErr, errNoAiConfigured) {
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_UNAVAILABLE, time.Now().Add(shoppingTripRetryAfterOutage), trip.Attempts, message)
	}

	// A failed call may still cost tokens: outages share the cap of three tries with unreadable answers.
	attempts := trip.Attempts + 1
	if attempts >= shoppingTripMaxBadAnswers {
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_FAILED, time.Now(), attempts, message)
	}

	return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_UNAVAILABLE, time.Now().Add(shoppingTripRetryAfterOutage), attempts, message)
}

// compare matches the receipt's products with what was planned, once the products have been read.
func (service ShoppingTripService) compare(trip models.ShoppingTrip, groupId uint) error {
	repository := repositories.NewShoppingTripRepository(service.TX)
	productRepository := repositories.NewReceiptProductRepository(service.TX)
	receiptId := *trip.ReceiptId

	extraction, err := productRepository.GetExtraction(receiptId)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = productRepository.EnsureReceiptProductsQueued(receiptId)
		if err != nil {
			return err
		}
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_PENDING, time.Now().Add(shoppingTripWaitForProducts), trip.Attempts, "")
	}
	if err != nil {
		return err
	}

	switch extraction.Status {
	case models.PRODUCT_EXTRACTION_DONE:
	case models.PRODUCT_EXTRACTION_FAILED:
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_FAILED, time.Now(), trip.Attempts,
			truncateRunes("The receipt's products could not be read: "+extraction.LastError, 500))
	case models.PRODUCT_EXTRACTION_UNAVAILABLE:
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_UNAVAILABLE, latest(extraction.NextAttemptAt, time.Now().Add(shoppingTripWaitForProducts)), trip.Attempts, extraction.LastError)
	default:
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_PENDING, time.Now().Add(shoppingTripWaitForProducts), trip.Attempts, "")
	}

	products, _, err := productRepository.GetReceiptProducts(receiptId)
	if err != nil {
		return err
	}
	productIds := make([]uint, len(products))
	for i, product := range products {
		productIds[i] = product.ID
	}

	planned := trip.GetPlannedItems()
	if len(products) == 0 || len(planned) == 0 {
		// Nothing to match: with an empty list, everything bought was unplanned.
		_, err = repository.SaveComparison(trip, productIds, map[uint]uint{})
		return err
	}

	var matches map[int]int
	outcome, aiErr := askTextAi(service.TX, groupId, buildTripComparisonPrompt(planned, products), "shopping trip",
		func(cleaned string) error {
			parsed, parseErr := parseTripComparisonResponse(cleaned, len(products), len(planned))
			matches = parsed
			return parseErr
		})

	switch outcome {
	case textAiNotConfigured, textAiUnreachable:
		return service.recordOutage(trip, aiErr)
	case textAiUnreadable:
		attempts := trip.Attempts + 1
		message := truncateRunes("The AI's comparison could not be read: "+aiErr.Error(), 500)
		if attempts >= shoppingTripMaxBadAnswers {
			return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_FAILED, time.Now(), attempts, message)
		}
		return repository.UpdateClaimedTrip(trip.ID, models.SHOPPING_TRIP_PENDING, time.Now().Add(shoppingTripRetryAfterBadAnswer), attempts, message)
	}

	byProductId := map[uint]uint{}
	for productIndex, itemIndex := range matches {
		byProductId[products[productIndex].ID] = planned[itemIndex].Id
	}
	_, err = repository.SaveComparison(trip, productIds, byProductId)
	return err
}

func latest(a time.Time, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

// buildTripComparisonPrompt numbers the list items and the products from 1, the ids the answer uses.
func buildTripComparisonPrompt(planned []models.ShoppingTripPlannedItem, products []models.ReceiptProduct) string {
	items := make([]map[string]string, len(planned))
	for i, item := range planned {
		items[i] = map[string]string{"id": strconv.Itoa(i + 1), "name": item.Name}
	}

	lines := make([]map[string]string, len(products))
	for i, product := range products {
		lines[i] = map[string]string{"id": strconv.Itoa(i + 1), "name": product.Name, "displayName": product.DisplayName}
	}

	itemJson, _ := json.Marshal(items)
	productJson, _ := json.Marshal(lines)
	return fmt.Sprintf(shoppingTripComparisonPrompt, string(itemJson), string(productJson))
}

type tripComparisonResponse struct {
	Products []struct {
		Id         json.RawMessage `json:"id"`
		ListItemId json.RawMessage `json:"listItemId"`
	} `json:"products"`
}

// parseTripComparisonResponse reads the AI's matches as product index → list item index (both from
// 0); a product absent from the result was not on the list. A match naming no real list entry counts
// as no match. An answer that leaves out any product is an error: guessing "unplanned" for products
// the AI skipped would overstate unplanned spending.
func parseTripComparisonResponse(cleanedResponse string, productCount int, itemCount int) (map[int]int, error) {
	var response tripComparisonResponse
	err := json.Unmarshal([]byte(cleanedResponse), &response)
	if err != nil {
		return nil, err
	}
	if response.Products == nil {
		return nil, errors.New(`the answer has no "products" list`)
	}

	answered := map[int]bool{}
	matches := map[int]int{}
	for _, entry := range response.Products {
		productId, err := strconv.Atoi(strings.TrimSpace(looseString(entry.Id)))
		if err != nil || productId < 1 || productId > productCount {
			continue
		}
		answered[productId-1] = true

		itemId, err := strconv.Atoi(strings.TrimSpace(looseString(entry.ListItemId)))
		if err == nil && itemId >= 1 && itemId <= itemCount {
			matches[productId-1] = itemId - 1
		}
	}

	if len(answered) < productCount {
		return nil, fmt.Errorf("the answer covers %d of %d products", len(answered), productCount)
	}
	return matches, nil
}
