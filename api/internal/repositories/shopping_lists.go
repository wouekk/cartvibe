package repositories

import (
	"cartvibe/api/internal/models"
	"time"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type ShoppingListRepository struct {
	BaseRepository
}

func NewShoppingListRepository(tx *gorm.DB) ShoppingListRepository {
	repository := ShoppingListRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX: tx,
	}}
	return repository
}

// orderShoppingListItems is the one place item order is defined, so a list fetched on its own and
// a list fetched with its group come back identically ordered.
func orderShoppingListItems(db *gorm.DB) *gorm.DB {
	return db.Order("created_at ASC").Order("id ASC")
}

// normalizeShoppingListItems makes an itemless list serialize its items as [] rather than null —
// the generated Dart deserializer has no null guard.
func normalizeShoppingListItems(list *models.ShoppingList) {
	if list.Items == nil {
		list.Items = []models.ShoppingListItem{}
	}
}

func (repository ShoppingListRepository) GetShoppingListsByGroupId(groupId uint) ([]models.ShoppingList, error) {
	db := repository.GetDB()
	lists := []models.ShoppingList{}

	err := db.
		Where("group_id = ?", groupId).
		Order("name ASC").
		Order("id ASC").
		Preload("Items", orderShoppingListItems).
		Find(&lists).Error
	if err != nil {
		return []models.ShoppingList{}, err
	}

	for i := range lists {
		normalizeShoppingListItems(&lists[i])
	}

	return lists, nil
}

func (repository ShoppingListRepository) GetShoppingListById(listId uint) (models.ShoppingList, error) {
	db := repository.GetDB()
	var list models.ShoppingList

	err := db.Preload("Items", orderShoppingListItems).First(&list, listId).Error
	if err != nil {
		return models.ShoppingList{}, err
	}

	normalizeShoppingListItems(&list)
	return list, nil
}

func (repository ShoppingListRepository) GetShoppingListItemById(itemId uint) (models.ShoppingListItem, error) {
	db := repository.GetDB()
	var item models.ShoppingListItem

	err := db.First(&item, itemId).Error
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	return item, nil
}

// GetGroupIdForShoppingList resolves a list's group, for authorizing a request addressed by list id.
func (repository ShoppingListRepository) GetGroupIdForShoppingList(listId uint) (uint, error) {
	db := repository.GetDB()
	var list models.ShoppingList

	err := db.Model(&models.ShoppingList{}).Select("group_id").Where("id = ?", listId).Take(&list).Error
	if err != nil {
		return 0, err
	}

	return list.GroupId, nil
}

// GetGroupIdForShoppingListItem resolves an item's group through its list, for authorizing a
// request addressed by item id.
func (repository ShoppingListRepository) GetGroupIdForShoppingListItem(itemId uint) (uint, error) {
	db := repository.GetDB()
	var result struct {
		GroupId uint
	}

	query := db.Model(&models.ShoppingListItem{}).
		Select("shopping_lists.group_id AS group_id").
		Joins("JOIN shopping_lists ON shopping_lists.id = shopping_list_items.shopping_list_id").
		Where("shopping_list_items.id = ?", itemId).
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

func (repository ShoppingListRepository) CreateShoppingList(list models.ShoppingList) (models.ShoppingList, error) {
	db := repository.GetDB()

	err := db.Create(&list).Error
	if err != nil {
		return models.ShoppingList{}, err
	}

	normalizeShoppingListItems(&list)
	return list, nil
}

func (repository ShoppingListRepository) UpdateShoppingListName(listId uint, name string) error {
	db := repository.GetDB()
	return db.Model(&models.ShoppingList{}).Where("id = ?", listId).Update("name", name).Error
}

// DeleteShoppingList removes a list and its items. The caller owns the transaction.
func (repository ShoppingListRepository) DeleteShoppingList(listId uint) error {
	db := repository.GetDB()

	err := db.Where("shopping_list_id = ?", listId).Delete(&models.ShoppingListItem{}).Error
	if err != nil {
		return err
	}

	return db.Delete(&models.ShoppingList{}, listId).Error
}

// DeleteShoppingListsForGroup removes every list in a group and their items, for group deletion.
// These are raw deletes, so nothing cascades: items go first. The caller owns the transaction.
func (repository ShoppingListRepository) DeleteShoppingListsForGroup(groupId uint) error {
	db := repository.GetDB()

	err := db.
		Where("shopping_list_id IN (?)", db.Model(&models.ShoppingList{}).Select("id").Where("group_id = ?", groupId)).
		Delete(&models.ShoppingListItem{}).Error
	if err != nil {
		return err
	}

	return db.Where("group_id = ?", groupId).Delete(&models.ShoppingList{}).Error
}

func (repository ShoppingListRepository) CreateShoppingListItem(item models.ShoppingListItem) (models.ShoppingListItem, error) {
	db := repository.GetDB()

	err := db.Create(&item).Error
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	return item, nil
}

// FindCheckedShoppingListItemByName finds the most recently crossed-off item on a list whose name
// matches, ignoring case. LOWER() on both sides is portable across SQLite, MySQL and Postgres.
// Returns gorm.ErrRecordNotFound when there is none.
func (repository ShoppingListRepository) FindCheckedShoppingListItemByName(listId uint, name string) (models.ShoppingListItem, error) {
	db := repository.GetDB()
	var item models.ShoppingListItem

	err := db.
		Where("shopping_list_id = ? AND is_checked = ? AND LOWER(name) = LOWER(?)", listId, true, name).
		Order("checked_at DESC").
		Order("id DESC").
		Take(&item).Error
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	return item, nil
}

// ShoppingListItemFields are the user-editable fields of an item.
type ShoppingListItemFields struct {
	Name     string
	Amount   *decimal.Decimal
	Unit     string
	Quantity string
	Note     string
}

// UpdateShoppingListItemFields writes every editable field, including empty values and a nil amount.
func (repository ShoppingListRepository) UpdateShoppingListItemFields(itemId uint, fields ShoppingListItemFields) error {
	db := repository.GetDB()

	return db.Model(&models.ShoppingListItem{}).
		Where("id = ?", itemId).
		Select("name", "amount", "unit", "quantity", "note").
		Updates(models.ShoppingListItem{
			Name:     fields.Name,
			Amount:   fields.Amount,
			Unit:     fields.Unit,
			Quantity: fields.Quantity,
			Note:     fields.Note,
		}).Error
}

// SetShoppingListItemChecked stamps who crossed an item off and when, or clears both on un-check.
func (repository ShoppingListRepository) SetShoppingListItemChecked(itemId uint, isChecked bool, userId uint) error {
	db := repository.GetDB()

	var checkedAt *time.Time
	var checkedByUserId *uint
	if isChecked {
		now := time.Now()
		checkedAt = &now
		checkedByUserId = &userId
	}

	return db.Model(&models.ShoppingListItem{}).
		Where("id = ?", itemId).
		Select("is_checked", "checked_at", "checked_by_user_id").
		Updates(models.ShoppingListItem{
			IsChecked:       isChecked,
			CheckedAt:       checkedAt,
			CheckedByUserId: checkedByUserId,
		}).Error
}

func (repository ShoppingListRepository) DeleteShoppingListItem(itemId uint) error {
	db := repository.GetDB()
	return db.Delete(&models.ShoppingListItem{}, itemId).Error
}

// ClearCheckedShoppingListItems deletes every crossed-off item on a list and returns their ids.
// The caller owns the transaction, so the ids read are exactly the ones deleted.
func (repository ShoppingListRepository) ClearCheckedShoppingListItems(listId uint) ([]uint, error) {
	db := repository.GetDB()
	itemIds := []uint{}

	err := db.Model(&models.ShoppingListItem{}).
		Where("shopping_list_id = ? AND is_checked = ?", listId, true).
		Pluck("id", &itemIds).Error
	if err != nil {
		return []uint{}, err
	}

	if len(itemIds) == 0 {
		return itemIds, nil
	}

	err = db.Where("id IN ?", itemIds).Delete(&models.ShoppingListItem{}).Error
	if err != nil {
		return []uint{}, err
	}

	return itemIds, nil
}
