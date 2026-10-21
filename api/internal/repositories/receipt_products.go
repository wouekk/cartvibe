package repositories

import (
	"errors"
	"strings"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ReceiptProductRepository struct {
	BaseRepository
}

func NewReceiptProductRepository(tx *gorm.DB) ReceiptProductRepository {
	repository := ReceiptProductRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX: tx,
	}}
	return repository
}

// MarkReceiptProductsPending (re)queues reading a receipt's products: on its first image, and again
// whenever another image is added or someone asks for a re-read, since products are re-read as a set.
func (repository ReceiptProductRepository) MarkReceiptProductsPending(receiptId uint) error {
	db := repository.GetDB()
	now := time.Now()

	return db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "receipt_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"status", "next_attempt_at", "attempts", "last_error", "updated_at"}),
	}).Create(&models.ReceiptProductExtraction{
		ReceiptId:     receiptId,
		Status:        models.PRODUCT_EXTRACTION_PENDING,
		NextAttemptAt: now,
		Attempts:      0,
		LastError:     "",
	}).Error
}

// ClaimDueExtraction hands out one extraction that is due — pending, waiting out an outage, or left
// RUNNING by a sweep that died — and marks it RUNNING with a lease (see claimDue). ok is false when
// nothing is due.
func (repository ReceiptProductRepository) ClaimDueExtraction(now time.Time) (models.ReceiptProductExtraction, bool, error) {
	extraction, ok, err := claimDue(
		repository.GetDB(),
		"receipt_id",
		func(extraction *models.ReceiptProductExtraction) any { return extraction.ReceiptId },
		[]models.ReceiptProductExtractionStatus{
			models.PRODUCT_EXTRACTION_PENDING,
			models.PRODUCT_EXTRACTION_UNAVAILABLE,
			models.PRODUCT_EXTRACTION_RUNNING,
		},
		models.PRODUCT_EXTRACTION_RUNNING,
		now,
	)
	if ok {
		extraction.Status = models.PRODUCT_EXTRACTION_RUNNING
	}
	return extraction, ok, err
}

// ClaimPendingExtraction claims one receipt's waiting extraction, the way ClaimDueExtraction claims the next
// due one: a conditional UPDATE, so a sweep running at the same moment cannot read it as well. ok is false when
// the row is not waiting (already claimed, read, or never queued).
func (repository ReceiptProductRepository) ClaimPendingExtraction(receiptId uint, now time.Time) (models.ReceiptProductExtraction, bool, error) {
	claimed := repository.GetDB().Model(&models.ReceiptProductExtraction{}).
		Where("receipt_id = ? AND status = ?", receiptId, models.PRODUCT_EXTRACTION_PENDING).
		Updates(map[string]any{
			"status":          models.PRODUCT_EXTRACTION_RUNNING,
			"next_attempt_at": now.Add(claimLease),
		})
	if claimed.Error != nil || claimed.RowsAffected != 1 {
		return models.ReceiptProductExtraction{}, false, claimed.Error
	}

	extraction, err := repository.GetExtraction(receiptId)
	if err != nil {
		return models.ReceiptProductExtraction{}, false, err
	}
	return extraction, true, nil
}

// EnsureReceiptProductsQueued queues a receipt that has never been queued, and leaves one that has
// alone: attaching a receipt to a list must not throw away products already read.
func (repository ReceiptProductRepository) EnsureReceiptProductsQueued(receiptId uint) error {
	return repository.GetDB().Clauses(clause.OnConflict{DoNothing: true}).Create(&models.ReceiptProductExtraction{
		ReceiptId:     receiptId,
		Status:        models.PRODUCT_EXTRACTION_PENDING,
		NextAttemptAt: time.Now(),
	}).Error
}

// GetExtraction returns a receipt's extraction; gorm.ErrRecordNotFound when it was never queued.
func (repository ReceiptProductRepository) GetExtraction(receiptId uint) (models.ReceiptProductExtraction, error) {
	var extraction models.ReceiptProductExtraction
	err := repository.GetDB().Where("receipt_id = ?", receiptId).Take(&extraction).Error
	return extraction, err
}

// UpdateExtraction records how a read went.
func (repository ReceiptProductRepository) UpdateExtraction(
	receiptId uint,
	status models.ReceiptProductExtractionStatus,
	nextAttemptAt time.Time,
	attempts int,
	lastError string,
) error {
	db := repository.GetDB()

	return db.Model(&models.ReceiptProductExtraction{}).
		Where("receipt_id = ?", receiptId).
		Updates(map[string]any{
			"status":          status,
			"next_attempt_at": nextAttemptAt,
			"attempts":        attempts,
			"last_error":      lastError,
		}).Error
}

// ReplaceProducts stores a receipt's products as a whole set and marks the read done, in one
// transaction, so a reader never sees half a set.
func (repository ReceiptProductRepository) ReplaceProducts(receiptId uint, products []models.ReceiptProduct) error {
	return repository.GetDB().Transaction(func(tx *gorm.DB) error {
		err := tx.Where("receipt_id = ?", receiptId).Delete(&models.ReceiptProduct{}).Error
		if err != nil {
			return err
		}

		if len(products) > 0 {
			err = tx.Create(&products).Error
			if err != nil {
				return err
			}
		}

		err = tx.Model(&models.ReceiptProductExtraction{}).
			Where("receipt_id = ?", receiptId).
			Updates(map[string]any{
				"status":     models.PRODUCT_EXTRACTION_DONE,
				"attempts":   0,
				"last_error": "",
			}).Error
		if err != nil {
			return err
		}

		// The new products carry no planned/unplanned marks, so the receipt's trip compares again.
		return NewShoppingTripRepository(tx).RequeueTripForReceipt(receiptId, time.Now())
	})
}

// GetReceiptProducts returns a receipt's products in receipt order, and its extraction (nil when the
// receipt has never been queued).
func (repository ReceiptProductRepository) GetReceiptProducts(receiptId uint) ([]models.ReceiptProduct, *models.ReceiptProductExtraction, error) {
	db := repository.GetDB()
	products := []models.ReceiptProduct{}

	err := db.Where("receipt_id = ?", receiptId).Order("position ASC").Order("id ASC").Find(&products).Error
	if err != nil {
		return []models.ReceiptProduct{}, nil, err
	}

	var extraction models.ReceiptProductExtraction
	err = db.Where("receipt_id = ?", receiptId).Take(&extraction).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return products, nil, nil
	}
	if err != nil {
		return []models.ReceiptProduct{}, nil, err
	}

	return products, &extraction, nil
}

// QueueUnreadReceiptsInGroup queues every receipt in the group that has an image but has never been
// queued — the backfill for receipts from before product reading existed. Returns how many it queued.
func (repository ReceiptProductRepository) QueueUnreadReceiptsInGroup(groupId uint) (int, error) {
	db := repository.GetDB()
	receiptIds := []uint{}

	err := db.Table("receipts").
		Distinct("receipts.id").
		Joins("INNER JOIN file_data ON file_data.receipt_id = receipts.id").
		Joins("LEFT JOIN receipt_product_extractions ON receipt_product_extractions.receipt_id = receipts.id").
		Where("receipts.group_id = ? AND receipt_product_extractions.receipt_id IS NULL", groupId).
		Pluck("receipts.id", &receiptIds).Error
	if err != nil {
		return 0, err
	}

	if len(receiptIds) == 0 {
		return 0, nil
	}

	now := time.Now()
	extractions := make([]models.ReceiptProductExtraction, len(receiptIds))
	for i, receiptId := range receiptIds {
		extractions[i] = models.ReceiptProductExtraction{
			ReceiptId:     receiptId,
			Status:        models.PRODUCT_EXTRACTION_PENDING,
			NextAttemptAt: now,
		}
	}

	err = db.Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(&extractions, 200).Error
	if err != nil {
		return 0, err
	}

	return len(receiptIds), nil
}

// DeleteReceiptProducts removes a receipt's products and its extraction. The caller owns the
// transaction; neither table is an association of Receipt, so a receipt delete cannot cascade to them.
func (repository ReceiptProductRepository) DeleteReceiptProducts(receiptId uint) error {
	db := repository.GetDB()

	err := db.Where("receipt_id = ?", receiptId).Delete(&models.ReceiptProduct{}).Error
	if err != nil {
		return err
	}

	return db.Where("receipt_id = ?", receiptId).Delete(&models.ReceiptProductExtraction{}).Error
}

// receiptIdBatchSize keeps an IN list well under every database's bound-variable limit.
const receiptIdBatchSize = 500

// GetPricedProductsWithHealth returns the products of the given receipts rated health that have an
// amount, for the caller to fold in Go (SQLite has no decimal type to SUM exactly).
func (repository ReceiptProductRepository) GetPricedProductsWithHealth(receiptIds []uint, health string) ([]models.ReceiptProduct, error) {
	db := repository.GetDB()
	products := []models.ReceiptProduct{}

	for start := 0; start < len(receiptIds); start += receiptIdBatchSize {
		end := min(start+receiptIdBatchSize, len(receiptIds))

		batch := []models.ReceiptProduct{}
		err := db.
			Select("id", "receipt_id", "amount").
			Where("receipt_id IN ? AND health = ? AND amount IS NOT NULL", receiptIds[start:end], health).
			Find(&batch).Error
		if err != nil {
			return []models.ReceiptProduct{}, err
		}
		products = append(products, batch...)
	}

	return products, nil
}

// CreateProduct adds a person's own product line at the end of the receipt's list (Phase 3 C5), and
// sends the receipt's shopping trip to be compared again.
func (repository ReceiptProductRepository) CreateProduct(receiptId uint, command commands.UpsertReceiptProductCommand) (models.ReceiptProduct, error) {
	var product models.ReceiptProduct

	err := repository.GetDB().Transaction(func(tx *gorm.DB) error {
		var last models.ReceiptProduct
		position := 0
		found := tx.Where("receipt_id = ?", receiptId).Order("position DESC").Limit(1).Find(&last)
		if found.Error != nil {
			return found.Error
		}
		if found.RowsAffected > 0 {
			position = last.Position + 1
		}

		product = models.ReceiptProduct{
			ReceiptId:   receiptId,
			Name:        command.Name,
			DisplayName: command.Name,
			Amount:      command.Amount,
			Quantity:    command.Quantity,
			Position:    position,
		}
		if err := tx.Create(&product).Error; err != nil {
			return err
		}

		return NewShoppingTripRepository(tx).RequeueTripForReceipt(receiptId, time.Now())
	})

	return product, err
}

// UpdateProduct changes a product line's name, amount and quantity. A new name drops the health and
// seasonality tags (unless a person corrected them) and the planned mark, so the product is classified
// and compared again as the product it now is.
func (repository ReceiptProductRepository) UpdateProduct(product models.ReceiptProduct, command commands.UpsertReceiptProductCommand) (models.ReceiptProduct, error) {
	renamed := models.NormalizeProductName(product.Name) != models.NormalizeProductName(command.Name) ||
		product.DisplayName != command.Name

	updates := map[string]any{
		"name":         command.Name,
		"display_name": command.Name,
		"amount":       command.Amount,
		"quantity":     command.Quantity,
	}
	if renamed {
		updates["planned"] = nil
		updates["matched_shopping_list_item_id"] = nil
		if !product.ClassificationOverridden {
			updates["health"] = ""
			updates["food_group"] = ""
			updates["seasonality"] = ""
			updates["classified_at"] = nil
			updates["classification_attempts"] = 0
		}
	}

	err := repository.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.ReceiptProduct{}).Where("id = ?", product.ID).Updates(updates).Error; err != nil {
			return err
		}

		return NewShoppingTripRepository(tx).RequeueTripForReceipt(product.ReceiptId, time.Now())
	})
	if err != nil {
		return models.ReceiptProduct{}, err
	}

	var updated models.ReceiptProduct
	err = repository.GetDB().First(&updated, product.ID).Error

	return updated, err
}

// DeleteProduct removes one product line and sends the receipt's trip to be compared again.
func (repository ReceiptProductRepository) DeleteProduct(product models.ReceiptProduct) error {
	return repository.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&models.ReceiptProduct{}, product.ID).Error; err != nil {
			return err
		}

		return NewShoppingTripRepository(tx).RequeueTripForReceipt(product.ReceiptId, time.Now())
	})
}

// GetPricedUnplannedProducts returns the priced products of the given receipts that were marked as not
// on the shopping list (planned = false). An unmarked product counts as planned, so it is not here.
func (repository ReceiptProductRepository) GetPricedUnplannedProducts(receiptIds []uint) ([]models.ReceiptProduct, error) {
	db := repository.GetDB()
	products := []models.ReceiptProduct{}

	for start := 0; start < len(receiptIds); start += receiptIdBatchSize {
		end := min(start+receiptIdBatchSize, len(receiptIds))

		batch := []models.ReceiptProduct{}
		err := db.
			Select("id", "receipt_id", "amount").
			Where("receipt_id IN ? AND planned = ? AND amount IS NOT NULL", receiptIds[start:end], false).
			Find(&batch).Error
		if err != nil {
			return []models.ReceiptProduct{}, err
		}
		products = append(products, batch...)
	}

	return products, nil
}

// GetProductsForReceiptsByKind returns whole product rows of the given receipts for the Dashboard's
// tap-through lists: kind UNHEALTHY (rated unhealthy) or UNPLANNED (marked not on the list), priced or not.
func (repository ReceiptProductRepository) GetProductsForReceiptsByKind(receiptIds []uint, kind string, foodGroup string) ([]models.ReceiptProduct, error) {
	db := repository.GetDB()
	products := []models.ReceiptProduct{}

	for start := 0; start < len(receiptIds); start += receiptIdBatchSize {
		end := min(start+receiptIdBatchSize, len(receiptIds))

		query := db.Where("receipt_id IN ?", receiptIds[start:end])
		switch kind {
		case "UNPLANNED":
			query = query.Where("planned = ?", false)
		case "FOODGROUP":
			// An empty group is the Dashboard's "Uncategorized"; otherwise match the name whatever its case.
			query = query.Where("LOWER(food_group) = ?", strings.ToLower(strings.TrimSpace(foodGroup)))
		default:
			query = query.Where("health = ?", models.HEALTH_UNHEALTHY)
		}

		batch := []models.ReceiptProduct{}
		if err := query.Find(&batch).Error; err != nil {
			return []models.ReceiptProduct{}, err
		}
		products = append(products, batch...)
	}

	return products, nil
}

// GetPricedProductsForReceipts returns the priced products of the given receipts with the columns the
// Dashboard's category split needs (amount and food group), for the caller to fold in Go.
func (repository ReceiptProductRepository) GetPricedProductsForReceipts(receiptIds []uint) ([]models.ReceiptProduct, error) {
	db := repository.GetDB()
	products := []models.ReceiptProduct{}

	for start := 0; start < len(receiptIds); start += receiptIdBatchSize {
		end := min(start+receiptIdBatchSize, len(receiptIds))

		batch := []models.ReceiptProduct{}
		err := db.
			Select("id", "receipt_id", "amount", "food_group").
			Where("receipt_id IN ? AND amount IS NOT NULL", receiptIds[start:end]).
			Find(&batch).Error
		if err != nil {
			return []models.ReceiptProduct{}, err
		}
		products = append(products, batch...)
	}

	return products, nil
}
