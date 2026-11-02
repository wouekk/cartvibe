package services

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/recipeimport"
	"cartvibe/api/internal/repositories"
	"context"

	"gorm.io/gorm"
)

// ReasonRecipeBusy is the preview failure reported when too many pages are already being fetched.
const ReasonRecipeBusy = "busy"

// recipeFetchSlots bounds the pages downloaded at once (each may be up to 5 MB), so a few tabs of imports cannot
// tie up the NAS. A preview that finds no free slot answers "busy" instead of queueing.
var recipeFetchSlots = make(chan struct{}, 4)

// RecipeImportService turns a recipe (a page or pasted text) into a preview, and merges chosen rows into a shopping
// list. Nothing here calls an AI: parsing is plain rules in package recipeimport.
type RecipeImportService struct {
	BaseService
	// Fetcher downloads recipe pages. The zero value is the hardened production fetcher; tests swap its Guard.
	Fetcher recipeimport.Fetcher
}

func NewRecipeImportService(tx *gorm.DB) RecipeImportService {
	return RecipeImportService{BaseService: BaseService{
		DB: repositories.GetDB(),
		TX: tx,
	}}
}

// Preview parses the command's page or text. A page that cannot be read comes back as a preview with a
// FailureReason, never an error.
func (service RecipeImportService) Preview(ctx context.Context, command commands.PreviewShoppingListRecipeCommand) recipeimport.Preview {
	if command.Url == "" {
		return recipeimport.FromText(command.Text)
	}

	select {
	case recipeFetchSlots <- struct{}{}:
		defer func() { <-recipeFetchSlots }()
	default:
		return recipeimport.Preview{SourceURL: command.Url, FailureReason: ReasonRecipeBusy}
	}
	return service.Fetcher.FromURL(ctx, command.Url)
}

// RecipePreviewItem is one parsed ingredient row. Quantity is a decimal string, null when the line gave none.
type RecipePreviewItem struct {
	Name     string  `json:"name"`
	Quantity *string `json:"quantity"`
	Unit     string  `json:"unit"`
	Original string  `json:"original"`
}

// RecipePreview is the preview endpoint's answer. FailureReason is an open string, "" when Items can be shown.
type RecipePreview struct {
	Title         string              `json:"title"`
	SourceUrl     string              `json:"sourceUrl"`
	Servings      *int                `json:"servings"`
	Source        string              `json:"source"`
	FailureReason string              `json:"failureReason"`
	Items         []RecipePreviewItem `json:"items"`
}

// NewRecipePreview shapes a parsed preview for the wire; Items is always an array.
func NewRecipePreview(preview recipeimport.Preview) RecipePreview {
	out := RecipePreview{
		Title:         preview.Title,
		SourceUrl:     preview.SourceURL,
		Source:        preview.Source,
		FailureReason: preview.FailureReason,
		Items:         make([]RecipePreviewItem, 0, len(preview.Items)),
	}
	if preview.Servings > 0 {
		servings := preview.Servings
		out.Servings = &servings
	}
	for _, item := range preview.Items {
		row := RecipePreviewItem{Name: item.Name, Unit: item.Unit, Original: item.Original}
		if item.Quantity != nil {
			quantity := item.Quantity.String()
			row.Quantity = &quantity
		}
		out.Items = append(out.Items, row)
	}
	return out
}

// RecipeImportResult is the list after an import, with how each row was handled.
type RecipeImportResult struct {
	List    models.ShoppingList `json:"list"`
	Added   int                 `json:"added"`
	Merged  int                 `json:"merged"`
	Revived int                 `json:"revived"`
}

// ImportItems merges the selected rows into the list in one transaction (the plan is in recipeimport.PlanMerge) and
// tells the group's subscribers once, with the whole list.
func (service RecipeImportService) ImportItems(
	groupId uint,
	listId uint,
	userId uint,
	command commands.ImportShoppingListRecipeCommand,
) (RecipeImportResult, error) {
	var result RecipeImportResult
	changed := false

	err := service.GetDB().Transaction(func(tx *gorm.DB) error {
		repository := repositories.NewShoppingListRepository(repositories.ImplicitCell(), tx)

		list, err := repository.GetShoppingListById(listId)
		if err != nil {
			return err
		}

		byId := make(map[uint]models.ShoppingListItem, len(list.Items))
		existing := make([]recipeimport.ExistingItem, 0, len(list.Items))
		for _, item := range list.Items {
			byId[item.ID] = item
			existing = append(existing, recipeimport.ExistingItem{
				ID:       item.ID,
				Name:     item.Name,
				Amount:   item.Amount,
				Unit:     item.Unit,
				Quantity: item.Quantity,
				Checked:  item.IsChecked,
			})
		}
		incoming := make([]recipeimport.Incoming, 0, len(command.Items))
		for _, item := range command.Items {
			incoming = append(incoming, recipeimport.Incoming{Name: item.Name, Amount: item.Amount, Unit: item.Unit})
		}

		merged := map[uint]bool{}
		revived := map[uint]bool{}
		wrote := false
		for _, op := range recipeimport.PlanMerge(existing, incoming) {
			switch op.Kind {
			case recipeimport.OpInsert:
				_, err = repository.CreateShoppingListItem(models.ShoppingListItem{
					BaseModel:      models.BaseModel{CreatedBy: &userId},
					ShoppingListId: listId,
					Name:           op.Name,
					Amount:         op.Stored.Amount,
					Unit:           op.Stored.Unit,
					Quantity:       op.Stored.Quantity,
				})
				if err != nil {
					return err
				}
				result.Added++
				wrote = true

			case recipeimport.OpUpdate:
				merged[op.ID] = true
				if op.NoChange {
					continue
				}
				wrote = true
				item := byId[op.ID]
				err = repository.UpdateShoppingListItemFields(op.ID, repositories.ShoppingListItemFields{
					Name:     item.Name,
					Amount:   op.Stored.Amount,
					Unit:     op.Stored.Unit,
					Quantity: op.Stored.Quantity,
					Note:     item.Note,
				})
				if err != nil {
					return err
				}

			case recipeimport.OpRevive:
				revived[op.ID] = true
				wrote = true
				item := byId[op.ID]
				err = repository.UpdateShoppingListItemFields(op.ID, repositories.ShoppingListItemFields{
					Name:     item.Name,
					Amount:   op.Stored.Amount,
					Unit:     op.Stored.Unit,
					Quantity: op.Stored.Quantity,
					Note:     item.Note,
				})
				if err != nil {
					return err
				}
				if err = repository.SetShoppingListItemChecked(op.ID, false, userId); err != nil {
					return err
				}
				// Back on the list, possibly in another month: its seasonality is worked out again. A
				// person's own correction is kept.
				if !item.ClassificationOverridden {
					err = repositories.NewFoodClassificationRepository(repositories.ImplicitCell(), tx).
						ResetClassification(repositories.ClassificationKindItem, op.ID)
					if err != nil {
						return err
					}
				}
			}
		}
		result.Merged, result.Revived = len(merged), len(revived)
		changed = wrote

		result.List, err = repository.GetShoppingListById(listId)
		return err
	})
	if err != nil {
		return RecipeImportResult{}, err
	}

	if changed {
		publishShoppingListEvent(models.ShoppingListEvent{
			Type:           models.ShoppingListEventListUpdated,
			GroupId:        groupId,
			ShoppingListId: listId,
			List:           &result.List,
		})
		notifyItemAdded(groupId, userId, listId)
	}

	return result, nil
}
