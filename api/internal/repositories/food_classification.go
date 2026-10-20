package repositories

import (
	"receipt-wrangler/api/internal/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ClassificationKindProduct = "product"
	ClassificationKindItem    = "item"
)

// ClassificationCandidate is one receipt product or shopping list item still to be classified,
// with what the classification needs: its group (for that group's AI and corrections), the name to
// classify, and the month it was bought in (for seasonality; zero for list items, which use "now").
type ClassificationCandidate struct {
	Kind           string
	Id             uint
	GroupId        uint
	Name           string
	DisplayName    string
	ReceiptDate    time.Time
	ShoppingListId uint
	Attempts       int
}

// ClassificationName is the name the AI and the corrections see: the plain display name when the AI
// gave one, otherwise the line as printed.
func (candidate ClassificationCandidate) ClassificationName() string {
	if candidate.DisplayName != "" {
		return candidate.DisplayName
	}
	return candidate.Name
}

// ClassificationResult is the outcome for one candidate.
type ClassificationResult struct {
	Health      string
	FoodGroup   string
	Seasonality string
}

type FoodClassificationRepository struct {
	BaseRepository
}

func NewFoodClassificationRepository(tx *gorm.DB) FoodClassificationRepository {
	return FoodClassificationRepository{BaseRepository: BaseRepository{DB: GetDB(), TX: tx}}
}

// pendingClassification is the shared "still to classify" condition, on either table.
func pendingClassification(table string) string {
	return table + ".classified_at IS NULL AND " +
		table + ".classification_overridden = false AND " +
		table + ".classification_attempts < ?"
}

// UnclassifiedProducts returns up to limit receipt products still to be classified, oldest first.
func (repository FoodClassificationRepository) UnclassifiedProducts(limit int) ([]ClassificationCandidate, error) {
	db := repository.GetDB()
	rows := []struct {
		Id                     uint
		Name                   string
		DisplayName            string
		ClassificationAttempts int
		GroupId                uint
		Date                   time.Time
	}{}

	err := db.Table("receipt_products").
		Select("receipt_products.id, receipt_products.name, receipt_products.display_name, receipt_products.classification_attempts, receipts.group_id, receipts.date").
		Joins("JOIN receipts ON receipts.id = receipt_products.receipt_id").
		Where(pendingClassification("receipt_products"), models.MaxFoodClassificationAttempts).
		Order("receipt_products.id ASC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	candidates := make([]ClassificationCandidate, len(rows))
	for i, row := range rows {
		candidates[i] = ClassificationCandidate{
			Kind:        ClassificationKindProduct,
			Id:          row.Id,
			GroupId:     row.GroupId,
			Name:        row.Name,
			DisplayName: row.DisplayName,
			ReceiptDate: row.Date,
			Attempts:    row.ClassificationAttempts,
		}
	}
	return candidates, nil
}

// UnclassifiedItems returns up to limit shopping list items still to be classified, oldest first.
func (repository FoodClassificationRepository) UnclassifiedItems(limit int) ([]ClassificationCandidate, error) {
	db := repository.GetDB()
	rows := []struct {
		Id                     uint
		Name                   string
		ClassificationAttempts int
		GroupId                uint
		ShoppingListId         uint
	}{}

	err := db.Table("shopping_list_items").
		Select("shopping_list_items.id, shopping_list_items.name, shopping_list_items.classification_attempts, shopping_lists.group_id, shopping_list_items.shopping_list_id").
		Joins("JOIN shopping_lists ON shopping_lists.id = shopping_list_items.shopping_list_id").
		Where(pendingClassification("shopping_list_items"), models.MaxFoodClassificationAttempts).
		Order("shopping_list_items.id ASC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	candidates := make([]ClassificationCandidate, len(rows))
	for i, row := range rows {
		candidates[i] = ClassificationCandidate{
			Kind:           ClassificationKindItem,
			Id:             row.Id,
			GroupId:        row.GroupId,
			Name:           row.Name,
			ShoppingListId: row.ShoppingListId,
			Attempts:       row.ClassificationAttempts,
		}
	}
	return candidates, nil
}

func classificationTable(kind string) string {
	if kind == ClassificationKindItem {
		return "shopping_list_items"
	}
	return "receipt_products"
}

// SaveClassification records the sweep's answer. It never overwrites a person's correction: the
// classification_overridden guard covers one made while the AI was answering.
func (repository FoodClassificationRepository) SaveClassification(candidate ClassificationCandidate, result ClassificationResult, now time.Time) error {
	return repository.GetDB().Table(classificationTable(candidate.Kind)).
		Where("id = ? AND classification_overridden = false", candidate.Id).
		Updates(map[string]any{
			"health":        result.Health,
			"food_group":    result.FoodGroup,
			"seasonality":   result.Seasonality,
			"classified_at": now,
		}).Error
}

// CountUnusableAnswer adds one to a candidate's attempts after the AI answered with something that
// could not be used for it.
func (repository FoodClassificationRepository) CountUnusableAnswer(candidate ClassificationCandidate) error {
	return repository.GetDB().Table(classificationTable(candidate.Kind)).
		Where("id = ?", candidate.Id).
		Update("classification_attempts", gorm.Expr("classification_attempts + 1")).Error
}

// SaveCorrection stores a person's correction on one product or item and marks it overridden.
// Seasonality is left as it was when empty.
func (repository FoodClassificationRepository) SaveCorrection(kind string, id uint, health string, seasonality string, now time.Time) error {
	updates := map[string]any{
		"health":                    health,
		"classified_at":             now,
		"classification_overridden": true,
	}
	if seasonality != "" {
		updates["seasonality"] = seasonality
	}

	return repository.GetDB().Table(classificationTable(kind)).Where("id = ?", id).Updates(updates).Error
}

// ResetClassification forgets an item's classification, so the sweep classifies it again — after its
// name changed, or when it comes back onto a list in another month.
func (repository FoodClassificationRepository) ResetClassification(kind string, id uint) error {
	return repository.GetDB().Table(classificationTable(kind)).Where("id = ?", id).Updates(map[string]any{
		"health":                    "",
		"food_group":                "",
		"seasonality":               "",
		"classified_at":             nil,
		"classification_overridden": false,
		"classification_attempts":   0,
	}).Error
}

// RememberCorrection keeps a group's view of a product's health for next time.
func (repository FoodClassificationRepository) RememberCorrection(groupId uint, name string, health string) error {
	normalized := models.NormalizeProductName(name)
	if normalized == "" {
		return nil
	}
	if len([]rune(normalized)) > 200 {
		normalized = string([]rune(normalized)[:200])
	}

	return repository.GetDB().Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "group_id"}, {Name: "normalized_name"}},
		DoUpdates: clause.AssignmentColumns([]string{"health", "updated_at"}),
	}).Create(&models.ProductClassificationOverride{
		GroupId:        groupId,
		NormalizedName: normalized,
		Health:         health,
	}).Error
}

// CorrectionsForGroup returns the group's remembered corrections, keyed by normalized name.
func (repository FoodClassificationRepository) CorrectionsForGroup(groupId uint) (map[string]string, error) {
	overrides := []models.ProductClassificationOverride{}
	err := repository.GetDB().Where("group_id = ?", groupId).Order("updated_at DESC").Find(&overrides).Error
	if err != nil {
		return nil, err
	}

	corrections := make(map[string]string, len(overrides))
	for _, override := range overrides {
		corrections[override.NormalizedName] = override.Health
	}
	return corrections, nil
}

// DeleteCorrectionsForGroup removes a group's remembered corrections, for group deletion.
func (repository FoodClassificationRepository) DeleteCorrectionsForGroup(groupId uint) error {
	return repository.GetDB().Where("group_id = ?", groupId).Delete(&models.ProductClassificationOverride{}).Error
}
