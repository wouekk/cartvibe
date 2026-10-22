package repositories

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
)

// maxSearchMatchesPerReceipt caps the product lines shown under one receipt of a search.
const maxSearchMatchesPerReceipt = 3

// fuzzySearchReceiptIds returns the ids of the receipts in groupIds that match the phrase on their
// name, shop, a comment or a product line. The matching is done in Go over three narrow reads of
// the group's texts, because the engines differ (SQLite has no trigram index) and a household's
// receipts are few. The caller still applies every visibility rule to the ids it gets back, so this
// can only narrow a result, never widen it. An empty result is {0}, the no-match sentinel an
// `IN ?` needs (an empty list would match everything on some drivers).
func (repository ReceiptRepository) fuzzySearchReceiptIds(groupIds []uint, query utils.FuzzyQuery) ([]uint, error) {
	if len(groupIds) == 0 {
		return []uint{0}, nil
	}

	db := repository.GetDB()
	matched := map[uint]bool{}

	receiptTexts := []struct {
		Id       uint
		Name     string
		ShopName string
	}{}
	err := db.Table("receipts").
		Select("id", "name", "shop_name").
		Where("group_id IN ?", groupIds).
		Find(&receiptTexts).Error
	if err != nil {
		return nil, err
	}
	for _, text := range receiptTexts {
		if query.Matches(text.Name) || query.Matches(text.ShopName) {
			matched[text.Id] = true
		}
	}

	commentTexts := []struct {
		ReceiptId uint
		Comment   string
	}{}
	err = db.Table("comments").
		Select("comments.receipt_id AS receipt_id", "comments.comment AS comment").
		Joins("JOIN receipts ON receipts.id = comments.receipt_id").
		Where("receipts.group_id IN ?", groupIds).
		Find(&commentTexts).Error
	if err != nil {
		return nil, err
	}
	for _, text := range commentTexts {
		if !matched[text.ReceiptId] && query.Matches(text.Comment) {
			matched[text.ReceiptId] = true
		}
	}

	productTexts := []struct {
		ReceiptId   uint
		Name        string
		DisplayName string
	}{}
	err = db.Table("receipt_products").
		Select("receipt_products.receipt_id AS receipt_id", "receipt_products.name AS name", "receipt_products.display_name AS display_name").
		Joins("JOIN receipts ON receipts.id = receipt_products.receipt_id").
		Where("receipts.group_id IN ?", groupIds).
		Find(&productTexts).Error
	if err != nil {
		return nil, err
	}
	for _, text := range productTexts {
		if !matched[text.ReceiptId] && (query.Matches(text.Name) || query.Matches(text.DisplayName)) {
			matched[text.ReceiptId] = true
		}
	}

	ids := make([]uint, 0, len(matched))
	for id := range matched {
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return []uint{0}, nil
	}

	return ids, nil
}

// GetProductSearchMatches returns, per receipt, the product lines that match the phrase (at most
// three, in receipt order) so the list can say why a receipt was found. A receipt that matched only
// on its name, shop or a comment has no entry.
func (repository ReceiptRepository) GetProductSearchMatches(receiptIds []uint, query utils.FuzzyQuery) (map[uint][]models.ReceiptSearchMatch, error) {
	matches := map[uint][]models.ReceiptSearchMatch{}
	if len(receiptIds) == 0 || query.Empty() {
		return matches, nil
	}

	db := repository.GetDB()

	for start := 0; start < len(receiptIds); start += receiptIdBatchSize {
		end := min(start+receiptIdBatchSize, len(receiptIds))

		products := []models.ReceiptProduct{}
		err := db.
			Select("id", "receipt_id", "name", "display_name", "amount", "position").
			Where("receipt_id IN ?", receiptIds[start:end]).
			Order("receipt_id, position, id").
			Find(&products).Error
		if err != nil {
			return nil, err
		}

		for _, product := range products {
			if len(matches[product.ReceiptId]) >= maxSearchMatchesPerReceipt {
				continue
			}
			if !query.Matches(product.Name) && !query.Matches(product.DisplayName) {
				continue
			}

			name := product.DisplayName
			if name == "" {
				name = product.Name
			}
			matches[product.ReceiptId] = append(matches[product.ReceiptId], models.ReceiptSearchMatch{
				Name:   name,
				Amount: product.Amount,
			})
		}
	}

	return matches, nil
}
