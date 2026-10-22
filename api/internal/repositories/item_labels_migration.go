package repositories

import (
	"strings"

	"receipt-wrangler/api/internal/models"

	"gorm.io/gorm"
)

const itemLevelCategoriesAndTagsMigration = "item-level-categories-and-tags-2026-10"

// itemLevelCategoriesAndTags moves an existing install to categories and tags on product lines, once:
//
//   - Every line that names a category (food_group) but has no category_id gets the id of the category
//     with that name or old name. Matched in Go, because LOWER() folds only ASCII on SQLite. A name with
//     no category left stays as it is and still shows under that name on the Dashboard.
//   - Every line gets the tags its receipt had: a receipt's tags described all of its lines, so this keeps
//     what each tag added up to. The receipt keeps its own tags too; nothing is removed.
//
// Additive only; an install without products does nothing.
func itemLevelCategoriesAndTags(tx *gorm.DB) error {
	err := backfillProductCategoryIds(tx)
	if err != nil {
		return err
	}

	return tx.Exec(`
		INSERT INTO receipt_product_tags (receipt_product_id, tag_id)
		SELECT receipt_products.id, receipt_tags.tag_id
		FROM receipt_products
		JOIN receipt_tags ON receipt_tags.receipt_id = receipt_products.receipt_id
		WHERE NOT EXISTS (
			SELECT 1 FROM receipt_product_tags existing
			WHERE existing.receipt_product_id = receipt_products.id AND existing.tag_id = receipt_tags.tag_id
		)`).Error
}

func backfillProductCategoryIds(tx *gorm.DB) error {
	categories := []models.Category{}
	err := tx.Model(&models.Category{}).Select("id", "name", "aliases").Find(&categories).Error
	if err != nil {
		return err
	}

	byName := map[string]uint{}
	for _, category := range categories {
		byName[categoryMatchKey(category.Name)] = category.ID
	}
	// Old names only where no current name claims them.
	for _, category := range categories {
		for _, alias := range CategoryAliases(category.Aliases) {
			if _, taken := byName[categoryMatchKey(alias)]; !taken {
				byName[categoryMatchKey(alias)] = category.ID
			}
		}
	}
	if len(byName) == 0 {
		return nil
	}

	names := []string{}
	err = tx.Model(&models.ReceiptProduct{}).
		Where("category_id IS NULL AND food_group <> ''").
		Distinct().Pluck("food_group", &names).Error
	if err != nil {
		return err
	}

	for _, name := range names {
		categoryId, found := byName[categoryMatchKey(name)]
		if !found {
			continue
		}
		err = tx.Model(&models.ReceiptProduct{}).
			Where("category_id IS NULL AND food_group = ?", name).
			Update("category_id", categoryId).Error
		if err != nil {
			return err
		}
	}

	return nil
}

func categoryMatchKey(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}
