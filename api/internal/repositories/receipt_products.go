package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/shopspring/decimal"
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
//
// What people set on the old lines survives a re-read: a line read again under the same name gets back
// its tags, and the category a person chose (the AI's own choice is replaced by the new answer's).
func (repository ReceiptProductRepository) ReplaceProducts(receiptId uint, products []models.ReceiptProduct) error {
	return repository.GetDB().Transaction(func(tx *gorm.DB) error {
		previous := []models.ReceiptProduct{}
		err := tx.Preload("Tags").Where("receipt_id = ?", receiptId).Order("position ASC").Find(&previous).Error
		if err != nil {
			return err
		}
		carryOverProductLabels(previous, products)

		err = deleteProductTags(tx, tx.Model(&models.ReceiptProduct{}).Select("id").Where("receipt_id = ?", receiptId))
		if err != nil {
			return err
		}

		err = tx.Where("receipt_id = ?", receiptId).Delete(&models.ReceiptProduct{}).Error
		if err != nil {
			return err
		}

		if len(products) > 0 {
			// Omit("Tags.*"): link the existing tags, never write the tag rows themselves.
			err = tx.Omit("Tags.*").Create(&products).Error
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

	err := db.Preload("Tags", func(db *gorm.DB) *gorm.DB { return db.Order("tags.name ASC") }).
		Where("receipt_id = ?", receiptId).Order("position ASC").Order("id ASC").Find(&products).Error
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

	err := deleteProductTags(db, db.Model(&models.ReceiptProduct{}).Select("id").Where("receipt_id = ?", receiptId))
	if err != nil {
		return err
	}

	err = db.Where("receipt_id = ?", receiptId).Delete(&models.ReceiptProduct{}).Error
	if err != nil {
		return err
	}

	return db.Where("receipt_id = ?", receiptId).Delete(&models.ReceiptProductExtraction{}).Error
}

// deleteProductTags removes the tag links of the products the subquery selects (their ids). Call it
// before deleting the products: the join table has foreign keys (on in SQLite too), and nothing cascades.
func deleteProductTags(db *gorm.DB, productIds *gorm.DB) error {
	return db.Table("receipt_product_tags").Where("receipt_product_id IN (?)", productIds).Delete(&struct{}{}).Error
}

// carryOverProductLabels gives each re-read line the tags, and the person-chosen category, of the old
// line with the same printed or plain name.
func carryOverProductLabels(previous []models.ReceiptProduct, products []models.ReceiptProduct) {
	byName := map[string]models.ReceiptProduct{}
	for _, old := range previous {
		if len(old.Tags) == 0 && !old.CategoryOverridden {
			continue
		}
		for _, name := range []string{old.Name, old.DisplayName} {
			key := models.NormalizeProductName(name)
			if _, taken := byName[key]; key != "" && !taken {
				byName[key] = old
			}
		}
	}
	if len(byName) == 0 {
		return
	}

	for i := range products {
		old, found := byName[models.NormalizeProductName(products[i].Name)]
		if !found {
			old, found = byName[models.NormalizeProductName(products[i].DisplayName)]
		}
		if !found {
			continue
		}

		products[i].Tags = old.Tags
		if old.CategoryOverridden {
			products[i].CategoryId = old.CategoryId
			products[i].FoodGroup = old.FoodGroup
			products[i].CategoryOverridden = true
		}
	}
}

// productLabels resolves a category and tags: the category's name (stored alongside its id) and the tag
// rows to link. The handler has already checked that the ids exist.
func productLabels(tx *gorm.DB, categoryId *uint, tagIds []uint) (string, []models.Tag, error) {
	categoryName := ""
	if categoryId != nil {
		var category models.Category
		if err := tx.Select("id", "name").First(&category, *categoryId).Error; err != nil {
			return "", nil, err
		}
		categoryName = category.Name
	}

	tags := []models.Tag{}
	if len(tagIds) > 0 {
		if err := tx.Where("id IN ?", tagIds).Find(&tags).Error; err != nil {
			return "", nil, err
		}
	}

	return categoryName, tags, nil
}

// replaceProductTags links the line to exactly these tags.
func replaceProductTags(tx *gorm.DB, productId uint, tags []models.Tag) error {
	if err := deleteProductTags(tx, tx.Model(&models.ReceiptProduct{}).Select("id").Where("id = ?", productId)); err != nil {
		return err
	}
	if len(tags) == 0 {
		return nil
	}

	links := make([]map[string]any, len(tags))
	for i, tag := range tags {
		links[i] = map[string]any{"receipt_product_id": productId, "tag_id": tag.ID}
	}
	return tx.Table("receipt_product_tags").Create(links).Error
}

// SetProductLabels sets a line's category and tags, and nothing else: no rename, no new comparison with
// the shopping list. A category different from the line's current one is a person's choice from then on.
func (repository ReceiptProductRepository) SetProductLabels(product models.ReceiptProduct, categoryId *uint, tagIds []uint) (models.ReceiptProduct, error) {
	err := repository.GetDB().Transaction(func(tx *gorm.DB) error {
		categoryName, tags, err := productLabels(tx, categoryId, tagIds)
		if err != nil {
			return err
		}

		err = tx.Model(&models.ReceiptProduct{}).Where("id = ?", product.ID).Updates(map[string]any{
			"category_id":         categoryId,
			"food_group":          categoryName,
			"category_overridden": product.CategoryOverridden || !sameId(product.CategoryId, categoryId),
		}).Error
		if err != nil {
			return err
		}

		return replaceProductTags(tx, product.ID, tags)
	})
	if err != nil {
		return models.ReceiptProduct{}, err
	}

	return getProductWithTags(repository.GetDB(), product.ID)
}

// getProductWithTags reloads one product with its tags, for a response.
func getProductWithTags(db *gorm.DB, productId uint) (models.ReceiptProduct, error) {
	var product models.ReceiptProduct
	err := db.Preload("Tags", func(db *gorm.DB) *gorm.DB { return db.Order("tags.name ASC") }).First(&product, productId).Error
	return product, err
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

		categoryName, tags, err := productLabels(tx, command.CategoryId, command.TagIds)
		if err != nil {
			return err
		}

		product = models.ReceiptProduct{
			ReceiptId:   receiptId,
			Name:        command.Name,
			DisplayName: command.Name,
			Amount:      command.Amount,
			Quantity:    command.Quantity,
			Position:    position,
			CategoryId:  command.CategoryId,
			// A category chosen with the line is the person's; without one the sweep may fill it in.
			CategoryOverridden: command.CategoryId != nil,
			Tags:               tags,
		}
		product.FoodGroup = categoryName
		if err := tx.Omit("Tags.*").Create(&product).Error; err != nil {
			return err
		}

		return NewShoppingTripRepository(tx).RequeueTripForReceipt(receiptId, time.Now())
	})
	if err != nil {
		return models.ReceiptProduct{}, err
	}

	return getProductWithTags(repository.GetDB(), product.ID)
}

// UpdateProduct changes a product line's name, amount, quantity, category and tags. A new name drops the
// health and seasonality tags (unless a person corrected them) and the planned mark, so the product is
// classified and compared again as the product it now is; its category goes too, unless a person chose it.
// A category different from the line's current one is a person's choice from then on.
func (repository ReceiptProductRepository) UpdateProduct(product models.ReceiptProduct, command commands.UpsertReceiptProductCommand) (models.ReceiptProduct, error) {
	renamed := models.NormalizeProductName(product.Name) != models.NormalizeProductName(command.Name) ||
		product.DisplayName != command.Name
	categoryChosen := product.CategoryOverridden || !sameId(product.CategoryId, command.CategoryId)
	categoryId := command.CategoryId
	if renamed && !categoryChosen {
		categoryId = nil
	}

	updates := map[string]any{
		"name":                command.Name,
		"display_name":        command.Name,
		"amount":              command.Amount,
		"quantity":            command.Quantity,
		"category_id":         categoryId,
		"category_overridden": categoryChosen,
	}
	if renamed {
		updates["planned"] = nil
		updates["matched_shopping_list_item_id"] = nil
		if !product.ClassificationOverridden {
			updates["health"] = ""
			updates["seasonality"] = ""
			updates["classified_at"] = nil
			updates["classification_attempts"] = 0
		}
	}

	err := repository.GetDB().Transaction(func(tx *gorm.DB) error {
		categoryName, tags, err := productLabels(tx, command.CategoryId, command.TagIds)
		if err != nil {
			return err
		}
		if categoryId == nil {
			categoryName = ""
		}
		updates["food_group"] = categoryName

		if err := tx.Model(&models.ReceiptProduct{}).Where("id = ?", product.ID).Updates(updates).Error; err != nil {
			return err
		}

		if err := replaceProductTags(tx, product.ID, tags); err != nil {
			return err
		}

		return NewShoppingTripRepository(tx).RequeueTripForReceipt(product.ReceiptId, time.Now())
	})
	if err != nil {
		return models.ReceiptProduct{}, err
	}

	return getProductWithTags(repository.GetDB(), product.ID)
}

func sameId(a *uint, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// DeleteProduct removes one product line and sends the receipt's trip to be compared again.
func (repository ReceiptProductRepository) DeleteProduct(product models.ReceiptProduct) error {
	return repository.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := deleteProductTags(tx, tx.Model(&models.ReceiptProduct{}).Select("id").Where("id = ?", product.ID)); err != nil {
			return err
		}
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

// ProductKindFilter picks the product lines behind one Dashboard tile or slice.
type ProductKindFilter struct {
	// Kind is UNHEALTHY (the default), UNPLANNED, FOODGROUP (a category slice) or TAG.
	Kind string
	// CategoryId picks a FOODGROUP slice by its category. Without it, FoodGroup names the slice: "" is
	// Uncategorized, a name is a product whose category is gone but whose name stayed.
	CategoryId *uint
	FoodGroup  string
	TagId      *uint
}

// GetProductsForReceiptsByKind returns whole product rows of the given receipts for the Dashboard's
// tap-through lists, priced or not.
func (repository ReceiptProductRepository) GetProductsForReceiptsByKind(receiptIds []uint, filter ProductKindFilter) ([]models.ReceiptProduct, error) {
	db := repository.GetDB()
	products := []models.ReceiptProduct{}

	for start := 0; start < len(receiptIds); start += receiptIdBatchSize {
		end := min(start+receiptIdBatchSize, len(receiptIds))

		query := db.Where("receipt_id IN ?", receiptIds[start:end])
		switch filter.Kind {
		case "UNPLANNED":
			query = query.Where("planned = ?", false)
		case "FOODGROUP":
			if filter.CategoryId != nil {
				query = query.Where("category_id = ?", *filter.CategoryId)
			} else {
				query = query.Where("category_id IS NULL AND LOWER(food_group) = ?", strings.ToLower(strings.TrimSpace(filter.FoodGroup)))
			}
		case "TAG":
			var tagId uint
			if filter.TagId != nil {
				tagId = *filter.TagId
			}
			query = query.Where("id IN (?)", db.Table("receipt_product_tags").Select("receipt_product_id").Where("tag_id = ?", tagId))
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
// Dashboard's category split needs (amount, category and the name kept with it), for the caller to fold in Go.
func (repository ReceiptProductRepository) GetPricedProductsForReceipts(receiptIds []uint) ([]models.ReceiptProduct, error) {
	db := repository.GetDB()
	products := []models.ReceiptProduct{}

	for start := 0; start < len(receiptIds); start += receiptIdBatchSize {
		end := min(start+receiptIdBatchSize, len(receiptIds))

		batch := []models.ReceiptProduct{}
		err := db.
			Select("id", "receipt_id", "amount", "food_group", "category_id").
			Where("receipt_id IN ? AND amount IS NOT NULL", receiptIds[start:end]).
			Find(&batch).Error
		if err != nil {
			return []models.ReceiptProduct{}, err
		}
		products = append(products, batch...)
	}

	return products, nil
}

// GetProductNamesForReceipts returns each receipt's product names in the order printed: the plain name when there is
// one, else the line as printed. Receipts without products are absent from the map.
func (repository ReceiptProductRepository) GetProductNamesForReceipts(receiptIds []uint) (map[uint][]string, error) {
	db := repository.GetDB()
	names := map[uint][]string{}

	for start := 0; start < len(receiptIds); start += receiptIdBatchSize {
		end := min(start+receiptIdBatchSize, len(receiptIds))

		batch := []models.ReceiptProduct{}
		err := db.
			Select("id", "receipt_id", "name", "display_name", "position").
			Where("receipt_id IN ?", receiptIds[start:end]).
			Order("receipt_id ASC").Order("position ASC").Order("id ASC").
			Find(&batch).Error
		if err != nil {
			return map[uint][]string{}, err
		}
		for _, product := range batch {
			name := product.DisplayName
			if name == "" {
				name = product.Name
			}
			names[product.ReceiptId] = append(names[product.ReceiptId], name)
		}
	}

	return names, nil
}

// GetReportLinesForReceipts returns the priced product lines of the given receipts with what a report reads
// (amount, category, health, planned mark and tags), in receipt order and then the order printed on the
// receipt, for the caller to group by receipt.
func (repository ReceiptProductRepository) GetReportLinesForReceipts(receiptIds []uint) ([]models.ReceiptProduct, error) {
	db := repository.GetDB()
	products := []models.ReceiptProduct{}

	for start := 0; start < len(receiptIds); start += receiptIdBatchSize {
		end := min(start+receiptIdBatchSize, len(receiptIds))

		batch := []models.ReceiptProduct{}
		err := db.
			Select("id", "receipt_id", "amount", "category_id", "food_group", "health", "planned", "position").
			Preload("Tags").
			Where("receipt_id IN ? AND amount IS NOT NULL", receiptIds[start:end]).
			Order("receipt_id, position, id").
			Find(&batch).Error
		if err != nil {
			return []models.ReceiptProduct{}, err
		}
		products = append(products, batch...)
	}

	return products, nil
}

// PricedProductTag is one priced product line carrying one tag.
type PricedProductTag struct {
	ReceiptProductId uint
	ReceiptId        uint
	TagId            uint
	Amount           decimal.Decimal
}

// GetPricedProductTags returns, for the given receipts, every priced product line carrying one of the
// given tags, once per tag, for the Dashboard's tag tiles to fold in Go.
func (repository ReceiptProductRepository) GetPricedProductTags(receiptIds []uint, tagIds []uint) ([]PricedProductTag, error) {
	db := repository.GetDB()
	rows := []PricedProductTag{}
	if len(tagIds) == 0 {
		return rows, nil
	}

	for start := 0; start < len(receiptIds); start += receiptIdBatchSize {
		end := min(start+receiptIdBatchSize, len(receiptIds))

		batch := []PricedProductTag{}
		err := db.Table("receipt_product_tags").
			Select("receipt_products.id AS receipt_product_id, receipt_products.receipt_id AS receipt_id, receipt_product_tags.tag_id AS tag_id, receipt_products.amount AS amount").
			Joins("JOIN receipt_products ON receipt_products.id = receipt_product_tags.receipt_product_id").
			Where("receipt_products.receipt_id IN ? AND receipt_products.amount IS NOT NULL AND receipt_product_tags.tag_id IN ?", receiptIds[start:end], tagIds).
			Scan(&batch).Error
		if err != nil {
			return []PricedProductTag{}, err
		}
		rows = append(rows, batch...)
	}

	return rows, nil
}
