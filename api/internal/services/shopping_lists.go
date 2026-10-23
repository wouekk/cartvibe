package services

import (
	"errors"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"

	"gorm.io/gorm"
)

// ShoppingListService owns the shopping list rules and broadcasts every mutation to the group's SSE
// subscribers, after the write, so a subscriber never sees a change that rolled back. Callers pass
// the group id they already resolved and authorized against.
type ShoppingListService struct {
	BaseService
}

func NewShoppingListService(tx *gorm.DB) ShoppingListService {
	service := ShoppingListService{BaseService: BaseService{
		DB: repositories.GetDB(),
		TX: tx,
	}}
	return service
}

func (service ShoppingListService) GetShoppingListsForGroup(groupId uint) ([]models.ShoppingList, error) {
	return repositories.NewShoppingListRepository(service.TX).GetShoppingListsByGroupId(groupId)
}

func (service ShoppingListService) CreateShoppingList(
	groupId uint,
	command commands.UpsertShoppingListCommand,
	userId uint,
) (models.ShoppingList, error) {
	list, err := repositories.NewShoppingListRepository(service.TX).CreateShoppingList(models.ShoppingList{
		BaseModel: models.BaseModel{CreatedBy: &userId},
		GroupId:   groupId,
		Name:      command.Name,
	})
	if err != nil {
		return models.ShoppingList{}, err
	}

	publishShoppingListEvent(models.ShoppingListEvent{
		Type:           models.ShoppingListEventListCreated,
		GroupId:        groupId,
		ShoppingListId: list.ID,
		List:           &list,
	})
notifyListCreated(groupId, userId, list.Name)

	return list, nil
}

func (service ShoppingListService) UpdateShoppingList(
	groupId uint,
	listId uint,
	command commands.UpsertShoppingListCommand,
) (models.ShoppingList, error) {
	repository := repositories.NewShoppingListRepository(service.TX)

	err := repository.UpdateShoppingListName(listId, command.Name)
	if err != nil {
		return models.ShoppingList{}, err
	}

	list, err := repository.GetShoppingListById(listId)
	if err != nil {
		return models.ShoppingList{}, err
	}

	publishShoppingListEvent(models.ShoppingListEvent{
		Type:           models.ShoppingListEventListUpdated,
		GroupId:        groupId,
		ShoppingListId: list.ID,
		List:           &list,
	})

	return list, nil
}

func (service ShoppingListService) DeleteShoppingList(groupId uint, listId uint) error {
	var photoPaths []string
	err := service.GetDB().Transaction(func(tx *gorm.DB) error {
		// Trips first: they reference the list.
		var tripErr error
		photoPaths, tripErr = repositories.NewShoppingTripRepository(tx).DeleteTripsForList(listId)
		if tripErr != nil {
			return tripErr
		}

		return repositories.NewShoppingListRepository(tx).DeleteShoppingList(listId)
	})
	if err != nil {
		return err
	}

	RemoveTripPhotos(photoPaths)

	publishShoppingListEvent(models.ShoppingListEvent{
		Type:           models.ShoppingListEventListDeleted,
		GroupId:        groupId,
		ShoppingListId: listId,
	})

	return nil
}

// AddShoppingListItem adds an item, or — when the name matches a crossed-off item on the same list —
// un-checks that item instead of duplicating it. That is how a regular item gets back onto the list.
// The revived item keeps its amount and note unless the request supplies new ones (an amount in
// either form replaces both forms). A matching item that is NOT crossed off is left alone: two lines
// of the same thing are allowed.
func (service ShoppingListService) AddShoppingListItem(
	groupId uint,
	listId uint,
	command commands.UpsertShoppingListItemCommand,
	userId uint,
) (models.ShoppingListItem, error) {
	var item models.ShoppingListItem
	eventType := models.ShoppingListEventItemAdded

	err := service.GetDB().Transaction(func(tx *gorm.DB) error {
		repository := repositories.NewShoppingListRepository(tx)

		existing, err := repository.FindCheckedShoppingListItemByName(listId, command.Name)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		if err == nil {
			fields := repositories.ShoppingListItemFields{
				Name:     existing.Name,
				Amount:   existing.Amount,
				Unit:     existing.Unit,
				Quantity: existing.Quantity,
				Note:     existing.Note,
			}
			if command.HasAmount() {
				fields.Amount = command.Amount
				fields.Unit = command.Unit
				fields.Quantity = command.Quantity
			}
			if len(command.Note) > 0 {
				fields.Note = command.Note
			}

			err = repository.UpdateShoppingListItemFields(existing.ID, fields)
			if err != nil {
				return err
			}

			err = repository.SetShoppingListItemChecked(existing.ID, false, userId)
			if err != nil {
				return err
			}

			// Back on the list, possibly in another month: its seasonality is worked out again. A
			// person's own correction is kept.
			if !existing.ClassificationOverridden {
				err = repositories.NewFoodClassificationRepository(tx).ResetClassification(repositories.ClassificationKindItem, existing.ID)
				if err != nil {
					return err
				}
			}

			item, err = repository.GetShoppingListItemById(existing.ID)
			eventType = models.ShoppingListEventItemToggled
			return err
		}

		item, err = repository.CreateShoppingListItem(models.ShoppingListItem{
			BaseModel:      models.BaseModel{CreatedBy: &userId},
			ShoppingListId: listId,
			Name:           command.Name,
			Amount:         command.Amount,
			Unit:           command.Unit,
			Quantity:       command.Quantity,
			Note:           command.Note,
		})
		return err
	})
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	publishShoppingListEvent(models.ShoppingListEvent{
		Type:           eventType,
		GroupId:        groupId,
		ShoppingListId: listId,
		Item:           &item,
	})
notifyItemAdded(groupId, userId, listId)

	return item, nil
}

func (service ShoppingListService) UpdateShoppingListItem(
	groupId uint,
	itemId uint,
	command commands.UpsertShoppingListItemCommand,
) (models.ShoppingListItem, error) {
	repository := repositories.NewShoppingListRepository(service.TX)

	existing, err := repository.GetShoppingListItemById(itemId)
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	err = repository.UpdateShoppingListItemFields(itemId, repositories.ShoppingListItemFields{
		Name:     command.Name,
		Amount:   command.Amount,
		Unit:     command.Unit,
		Quantity: command.Quantity,
		Note:     command.Note,
	})
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	// A different product now: its tags (and any correction, which was about the old one) no longer apply.
	if models.NormalizeProductName(existing.Name) != models.NormalizeProductName(command.Name) {
		err = repositories.NewFoodClassificationRepository(service.TX).ResetClassification(repositories.ClassificationKindItem, itemId)
		if err != nil {
			return models.ShoppingListItem{}, err
		}
	}

	item, err := repository.GetShoppingListItemById(itemId)
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	publishShoppingListEvent(models.ShoppingListEvent{
		Type:           models.ShoppingListEventItemUpdated,
		GroupId:        groupId,
		ShoppingListId: item.ShoppingListId,
		Item:           &item,
	})

	return item, nil
}

// SetShoppingListItemChecked moves an item to the target state. Re-sending the state an item is
// already in changes nothing — it keeps the original checkedAt — and broadcasts nothing.
func (service ShoppingListService) SetShoppingListItemChecked(
	groupId uint,
	itemId uint,
	isChecked bool,
	userId uint,
) (models.ShoppingListItem, error) {
	var item models.ShoppingListItem
	changed := false

	err := service.GetDB().Transaction(func(tx *gorm.DB) error {
		repository := repositories.NewShoppingListRepository(tx)

		current, err := repository.GetShoppingListItemById(itemId)
		if err != nil {
			return err
		}

		if current.IsChecked == isChecked {
			item = current
			return nil
		}

		err = repository.SetShoppingListItemChecked(itemId, isChecked, userId)
		if err != nil {
			return err
		}

		changed = true
		item, err = repository.GetShoppingListItemById(itemId)
		return err
	})
	if err != nil {
		return models.ShoppingListItem{}, err
	}

	if changed {
		publishShoppingListEvent(models.ShoppingListEvent{
			Type:           models.ShoppingListEventItemToggled,
			GroupId:        groupId,
			ShoppingListId: item.ShoppingListId,
			Item:           &item,
		})
	}

	return item, nil
}

// SetShoppingListChecked crosses a whole list off ("Mark as complete") or back on ("Restore", Undo),
// limited to itemIds when given. The list is sent to subscribers whole, as LIST_UPDATED, and only
// when something changed.
func (service ShoppingListService) SetShoppingListChecked(
	groupId uint,
	listId uint,
	itemIds []uint,
	isChecked bool,
	userId uint,
) (models.ShoppingList, error) {
	var list models.ShoppingList
	var changedIds []uint

	err := service.GetDB().Transaction(func(tx *gorm.DB) error {
		repository := repositories.NewShoppingListRepository(tx)

		var err error
		changedIds, err = repository.SetShoppingListItemsChecked(listId, itemIds, isChecked, userId)
		if err != nil {
			return err
		}

		list, err = repository.GetShoppingListById(listId)
		return err
	})
	if err != nil {
		return models.ShoppingList{}, err
	}

	if len(changedIds) > 0 {
		publishShoppingListEvent(models.ShoppingListEvent{
			Type:           models.ShoppingListEventListUpdated,
			GroupId:        groupId,
			ShoppingListId: listId,
			List:           &list,
		})
	}

	return list, nil
}

func (service ShoppingListService) DeleteShoppingListItem(groupId uint, itemId uint) error {
	repository := repositories.NewShoppingListRepository(service.TX)

	item, err := repository.GetShoppingListItemById(itemId)
	if err != nil {
		return err
	}

	err = repository.DeleteShoppingListItem(itemId)
	if err != nil {
		return err
	}

	publishShoppingListEvent(models.ShoppingListEvent{
		Type:           models.ShoppingListEventItemDeleted,
		GroupId:        groupId,
		ShoppingListId: item.ShoppingListId,
		Item:           &item,
	})

	return nil
}

func (service ShoppingListService) ClearCheckedShoppingListItems(groupId uint, listId uint) ([]uint, error) {
	var itemIds []uint

	err := service.GetDB().Transaction(func(tx *gorm.DB) error {
		var err error
		itemIds, err = repositories.NewShoppingListRepository(tx).ClearCheckedShoppingListItems(listId)
		return err
	})
	if err != nil {
		return []uint{}, err
	}

	if len(itemIds) > 0 {
		publishShoppingListEvent(models.ShoppingListEvent{
			Type:           models.ShoppingListEventCheckedCleared,
			GroupId:        groupId,
			ShoppingListId: listId,
			ItemIds:        itemIds,
		})
	}

	return itemIds, nil
}

// publishShoppingListEvent is called only after a method's write has returned successfully. That is
// "after commit" because the handlers construct this service without an outer transaction; a caller
// that passes one must not expect the broadcast to wait for its commit.
func publishShoppingListEvent(event models.ShoppingListEvent) {
	GetShoppingListHub().Publish(event)
}
