package repositories

import (
	"receipt-wrangler/api/internal/models"
	"time"

	"gorm.io/gorm"
)

type ShoppingTripRepository struct {
	BaseRepository
}

func NewShoppingTripRepository(tx *gorm.DB) ShoppingTripRepository {
	repository := ShoppingTripRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX: tx,
	}}
	return repository
}

func (repository ShoppingTripRepository) CreateTrip(trip *models.ShoppingTrip) error {
	return repository.GetDB().Create(trip).Error
}

func (repository ShoppingTripRepository) GetTripById(tripId uint) (models.ShoppingTrip, error) {
	var trip models.ShoppingTrip
	err := repository.GetDB().First(&trip, tripId).Error
	return trip, err
}

// GetTripForReceipt returns the trip a receipt is on; gorm.ErrRecordNotFound when it is on none.
func (repository ShoppingTripRepository) GetTripForReceipt(receiptId uint) (models.ShoppingTrip, error) {
	var trip models.ShoppingTrip
	err := repository.GetDB().Where("receipt_id = ?", receiptId).Take(&trip).Error
	return trip, err
}

// GetTripsForList returns a list's most recent trips, newest first.
func (repository ShoppingTripRepository) GetTripsForList(listId uint, limit int) ([]models.ShoppingTrip, error) {
	trips := []models.ShoppingTrip{}
	err := repository.GetDB().
		Where("shopping_list_id = ?", listId).
		Order("created_at DESC").
		Order("id DESC").
		Limit(limit).
		Find(&trips).Error
	if err != nil {
		return []models.ShoppingTrip{}, err
	}
	return trips, nil
}

// GetGroupIdForTrip resolves a trip's group through its list, for authorizing a request addressed by
// trip id.
func (repository ShoppingTripRepository) GetGroupIdForTrip(tripId uint) (uint, error) {
	var result struct {
		GroupId uint
	}

	query := repository.GetDB().Model(&models.ShoppingTrip{}).
		Select("shopping_lists.group_id AS group_id").
		Joins("JOIN shopping_lists ON shopping_lists.id = shopping_trips.shopping_list_id").
		Where("shopping_trips.id = ?", tripId).
		Limit(1).
		Scan(&result)
	if query.Error != nil {
		return 0, query.Error
	}
	if query.RowsAffected == 0 {
		return 0, gorm.ErrRecordNotFound
	}

	return result.GroupId, nil
}

// ClaimDueTrip hands out one trip that is due and marks it RUNNING with a lease (see claimDue).
func (repository ShoppingTripRepository) ClaimDueTrip(now time.Time) (models.ShoppingTrip, bool, error) {
	trip, ok, err := claimDue(
		repository.GetDB(),
		"id",
		func(trip *models.ShoppingTrip) any { return trip.ID },
		[]models.ShoppingTripStatus{
			models.SHOPPING_TRIP_PENDING,
			models.SHOPPING_TRIP_UNAVAILABLE,
			models.SHOPPING_TRIP_RUNNING,
		},
		models.SHOPPING_TRIP_RUNNING,
		now,
	)
	if ok {
		trip.Status = models.SHOPPING_TRIP_RUNNING
	}
	return trip, ok, err
}

// UpdateClaimedTrip records how a claimed trip's step went. It only touches a trip that is still
// RUNNING: one detached, or sent back to PENDING by a re-read of its products, is left as it is.
func (repository ShoppingTripRepository) UpdateClaimedTrip(
	tripId uint,
	status models.ShoppingTripStatus,
	nextAttemptAt time.Time,
	attempts int,
	lastError string,
) error {
	return repository.GetDB().Model(&models.ShoppingTrip{}).
		Where("id = ? AND status = ?", tripId, models.SHOPPING_TRIP_RUNNING).
		Updates(map[string]any{
			"status":          status,
			"next_attempt_at": nextAttemptAt,
			"attempts":        attempts,
			"last_error":      lastError,
		}).Error
}

// SetTripReceipt records the receipt a trip's photo became, and queues the trip's next step.
func (repository ShoppingTripRepository) SetTripReceipt(tripId uint, receiptId uint, now time.Time) error {
	return repository.GetDB().Model(&models.ShoppingTrip{}).
		Where("id = ?", tripId).
		Updates(map[string]any{
			"receipt_id":      receiptId,
			"photo_path":      "",
			"photo_name":      "",
			"status":          models.SHOPPING_TRIP_PENDING,
			"next_attempt_at": now,
			"attempts":        0,
			"last_error":      "",
		}).Error
}

// SaveComparison marks each of the receipt's products planned (with the list item it matched) or not,
// and the trip done, in one transaction. matches maps a product id to its list item id; a product
// absent from it was not on the list. Nothing is written, and false returned, when the trip is no
// longer RUNNING: detached, or its products re-read since this comparison started.
func (repository ShoppingTripRepository) SaveComparison(trip models.ShoppingTrip, productIds []uint, matches map[uint]uint) (bool, error) {
	saved := false

	err := repository.GetDB().Transaction(func(tx *gorm.DB) error {
		done := tx.Model(&models.ShoppingTrip{}).
			Where("id = ? AND status = ?", trip.ID, models.SHOPPING_TRIP_RUNNING).
			Updates(map[string]any{
				"status":     models.SHOPPING_TRIP_DONE,
				"attempts":   0,
				"last_error": "",
			})
		if done.Error != nil || done.RowsAffected == 0 {
			return done.Error
		}

		for _, productId := range productIds {
			planned := false
			var matchedItemId *uint
			if itemId, ok := matches[productId]; ok {
				planned = true
				matchedItemId = &itemId
			}

			err := tx.Model(&models.ReceiptProduct{}).
				Where("id = ? AND receipt_id = ?", productId, *trip.ReceiptId).
				Updates(map[string]any{"planned": planned, "matched_shopping_list_item_id": matchedItemId}).Error
			if err != nil {
				return err
			}
		}

		saved = true
		return nil
	})

	return saved, err
}

// RequeueTripForReceipt sends a receipt's trip, if it has one, back for another comparison.
func (repository ShoppingTripRepository) RequeueTripForReceipt(receiptId uint, now time.Time) error {
	return repository.GetDB().Model(&models.ShoppingTrip{}).
		Where("receipt_id = ?", receiptId).
		Updates(map[string]any{
			"status":          models.SHOPPING_TRIP_PENDING,
			"next_attempt_at": now,
			"queued_at":       now,
			"attempts":        0,
			"last_error":      "",
		}).Error
}

// RequeueFailedTrip gives a failed trip another try, with a fresh retry window. False when the trip
// had not failed.
func (repository ShoppingTripRepository) RequeueFailedTrip(tripId uint, now time.Time) (bool, error) {
	result := repository.GetDB().Model(&models.ShoppingTrip{}).
		Where("id = ? AND status = ?", tripId, models.SHOPPING_TRIP_FAILED).
		Updates(map[string]any{
			"status":          models.SHOPPING_TRIP_PENDING,
			"next_attempt_at": now,
			"queued_at":       now,
			"attempts":        0,
			"last_error":      "",
		})
	return result.RowsAffected == 1, result.Error
}

// DeleteTrip detaches one trip. Returns the photo it was still holding, for the caller to remove
// once its transaction commits.
func (repository ShoppingTripRepository) DeleteTrip(tripId uint) ([]string, error) {
	return repository.deleteTrips(repository.GetDB().Where("id = ?", tripId))
}

// DeleteTripsForList detaches every trip on a list (see DeleteTrip).
func (repository ShoppingTripRepository) DeleteTripsForList(listId uint) ([]string, error) {
	return repository.deleteTrips(repository.GetDB().Where("shopping_list_id = ?", listId))
}

// DeleteTripsForGroup detaches every trip on the group's lists (see DeleteTrip).
func (repository ShoppingTripRepository) DeleteTripsForGroup(groupId uint) ([]string, error) {
	db := repository.GetDB()
	return repository.deleteTrips(db.Where(
		"shopping_list_id IN (?)",
		db.Model(&models.ShoppingList{}).Select("id").Where("group_id = ?", groupId),
	))
}

// DeleteTripForReceipt removes the trip of a receipt being deleted.
func (repository ShoppingTripRepository) DeleteTripForReceipt(receiptId uint) error {
	_, err := repository.deleteTrips(repository.GetDB().Where("receipt_id = ?", receiptId))
	return err
}

// deleteTrips removes the trips the scope selects and clears the planned marks it put on their
// receipts' products, since a receipt on no list is not compared. The caller owns the transaction.
func (repository ShoppingTripRepository) deleteTrips(scope *gorm.DB) ([]string, error) {
	db := repository.GetDB()
	trips := []models.ShoppingTrip{}

	err := scope.Find(&trips).Error
	if err != nil || len(trips) == 0 {
		return []string{}, err
	}

	tripIds := make([]uint, 0, len(trips))
	receiptIds := []uint{}
	photoPaths := []string{}
	for _, trip := range trips {
		tripIds = append(tripIds, trip.ID)
		if trip.ReceiptId != nil {
			receiptIds = append(receiptIds, *trip.ReceiptId)
		}
		if trip.PhotoPath != "" {
			photoPaths = append(photoPaths, trip.PhotoPath)
		}
	}

	if len(receiptIds) > 0 {
		err = db.Model(&models.ReceiptProduct{}).
			Where("receipt_id IN ?", receiptIds).
			Updates(map[string]any{"planned": nil, "matched_shopping_list_item_id": nil}).Error
		if err != nil {
			return []string{}, err
		}
	}

	err = db.Where("id IN ?", tripIds).Delete(&models.ShoppingTrip{}).Error
	if err != nil {
		return []string{}, err
	}

	return photoPaths, nil
}

// GetProductsForReceipts returns the products of the given receipts, keyed by receipt id.
func (repository ShoppingTripRepository) GetProductsForReceipts(receiptIds []uint) (map[uint][]models.ReceiptProduct, error) {
	byReceipt := map[uint][]models.ReceiptProduct{}
	if len(receiptIds) == 0 {
		return byReceipt, nil
	}

	products := []models.ReceiptProduct{}
	err := repository.GetDB().
		Where("receipt_id IN ?", receiptIds).
		Order("position ASC").
		Order("id ASC").
		Find(&products).Error
	if err != nil {
		return byReceipt, err
	}

	for _, product := range products {
		byReceipt[product.ReceiptId] = append(byReceipt[product.ReceiptId], product)
	}
	return byReceipt, nil
}
