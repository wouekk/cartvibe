package repositories

import (
	"errors"
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
