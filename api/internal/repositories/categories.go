package repositories

import (
	"fmt"
	"strings"
	"gorm.io/gorm"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
)

type CategoryRepository struct {
	BaseRepository
}

func NewCategoryRepository(tx *gorm.DB) CategoryRepository {
	repository := CategoryRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX: tx,
	}}
	return repository
}

func (repository CategoryRepository) GetAllCategories(querySelect string) ([]models.Category, error) {
	db := repository.GetDB()
	var categories []models.Category

	err := db.Table("categories").Select(querySelect).Find(&categories).Error
	if err != nil {
		return nil, err
	}

	return categories, nil
}

// GetByIds returns the full category records for the given ids (order not guaranteed). Used to
// resolve names for id-only selections (e.g. quick-scan category picks) so they can flow through
// receipt validation, which requires a category name.
func (repository CategoryRepository) GetByIds(ids []uint) ([]models.Category, error) {
	db := repository.GetDB()
	var categories []models.Category

	if len(ids) == 0 {
		return categories, nil
	}

	err := db.Model(&models.Category{}).Where("id IN ?", ids).Find(&categories).Error
	if err != nil {
		return nil, err
	}

	return categories, nil
}

// CountByIds returns how many of the given category ids exist. Used to validate
// that a role's category grants reference real categories. Duplicate ids in the
// input are de-duplicated by the IN clause, so callers should pass a unique set.
func (repository CategoryRepository) CountByIds(ids []uint) (int64, error) {
	db := repository.GetDB()

	var count int64
	err := db.Model(&models.Category{}).Where("id IN ?", ids).Count(&count).Error
	if err != nil {
		return 0, err
	}

	return count, nil
}

func (repository CategoryRepository) CreateCategory(category models.Category) (models.Category, error) {
	db := repository.GetDB()

	err := db.Model(&category).Create(&category).Error
	if err != nil {
		return models.Category{}, err
	}

	return category, nil
}

func (repository CategoryRepository) GetAllPagedCategories(pagedRequestCommand commands.PagedRequestCommand) ([]models.CategoryView, error) {
	db := repository.GetDB()
	var categories []models.CategoryView
	quotedAlias := "\"NumberOfReceipts\""

	if pagedRequestCommand.OrderBy == "numberOfProducts" {
		pagedRequestCommand.OrderBy = "\"NumberOfProducts\""
	}

	if pagedRequestCommand.OrderBy == "numberOfReceipts" {
		pagedRequestCommand.OrderBy = quotedAlias
	}

	// The product count joins receipt_products, which has a name column of its own, so a bare "name"
	// in the ORDER BY is ambiguous ("SQL logic error: ambiguous column name: name").
	pagedRequestCommand.OrderBy = qualifyColumn("categories", pagedRequestCommand.OrderBy)

	query := repository.Sort(db, pagedRequestCommand.OrderBy, pagedRequestCommand.SortDirection)
	query = query.Scopes(repository.Paginate(pagedRequestCommand.Page, pagedRequestCommand.PageSize))
	selectString := fmt.Sprintf("categories.id, categories.name, categories.description, categories.skipped, categories.aliases, COUNT(DISTINCT receipt_categories.receipt_id) as %s, COUNT(DISTINCT receipt_products.id) as \"NumberOfProducts\"", quotedAlias)
	query = query.Table("categories").
		Select(selectString).
		Joins("LEFT JOIN receipt_categories ON categories.id = receipt_categories.category_id").
		Joins("LEFT JOIN receipt_products ON LOWER(receipt_products.food_group) = LOWER(categories.name)").
		Group("categories.id, categories.name, categories.description, categories.skipped, categories.aliases")

	err := query.Scan(&categories).Error
	if err != nil {
		return nil, err
	}

	return categories, nil
}


func (repository CategoryRepository) DeleteCategory(categoryId uint) error {
	db := repository.GetDB()

	err := db.Transaction(func(tx *gorm.DB) error {
		err := tx.Delete(&models.ReceiptCategory{}, "category_id = ?", categoryId).Error
		if err != nil {
			return err
		}

		err = tx.Where("id = ?", categoryId).Delete(&models.Category{}).Error
		if err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return err
	}

	return nil
}

// UpdateCategory saves a category's name, description and skip flag. A rename (Phase 3 feedback) also
// keeps the old name as an alias, so the AI is told to use the new name instead of it and an answer
// that still says the old name lands here, and moves the products that carried the old name to the new
// one, so the Dashboard and the products lists agree at once. Everything is one transaction.
func (repository CategoryRepository) UpdateCategory(categoryToUpdate models.Category, querySelect string) (models.Category, error) {
	db := repository.GetDB()

	var current models.Category
	err := db.First(&current, categoryToUpdate.ID).Error
	if err != nil {
		return models.Category{}, err
	}

	newName := strings.TrimSpace(categoryToUpdate.Name)
	aliases := current.Aliases
	renamed := !strings.EqualFold(current.Name, newName)
	if renamed {
		aliases = AddCategoryAlias(aliases, current.Name)
		// A name that was once an alias and is used again is no longer one.
		aliases = RemoveCategoryAlias(aliases, newName)
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		err := tx.Model(models.Category{}).Where("id = ?", categoryToUpdate.ID).Updates(map[string]interface{}{
			"name":        newName,
			"description": categoryToUpdate.Description,
			"skipped":     categoryToUpdate.Skipped,
			"aliases":     aliases,
		}).Error
		if err != nil {
			return err
		}

		if renamed {
			return tx.Model(&models.ReceiptProduct{}).
				Where("LOWER(food_group) = ?", strings.ToLower(current.Name)).
				Update("food_group", newName).Error
		}
		return nil
	})
	if err != nil {
		return models.Category{}, err
	}

	categoryToUpdate.Name = newName
	categoryToUpdate.Aliases = aliases
	return categoryToUpdate, nil
}

// CategoryAliases lists a category's old names.
func CategoryAliases(aliases string) []string {
	names := []string{}
	for _, line := range strings.Split(aliases, "\n") {
		if name := strings.TrimSpace(line); name != "" {
			names = append(names, name)
		}
	}
	return names
}

// AddCategoryAlias adds an old name unless it is already there (any case).
func AddCategoryAlias(aliases string, name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return aliases
	}
	for _, existing := range CategoryAliases(aliases) {
		if strings.EqualFold(existing, name) {
			return aliases
		}
	}
	if aliases == "" {
		return name
	}
	return aliases + "\n" + name
}

// RemoveCategoryAlias drops a name from the list (any case).
func RemoveCategoryAlias(aliases string, name string) string {
	kept := []string{}
	for _, existing := range CategoryAliases(aliases) {
		if !strings.EqualFold(existing, name) {
			kept = append(kept, existing)
		}
	}
	return strings.Join(kept, "\n")
}
