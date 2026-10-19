package models

import "time"

// Maximum lengths, matching the column definitions below (see MaxShoppingListNameLength).
const (
	MaxShoppingListItemNameLength     = 200
	MaxShoppingListItemQuantityLength = 50
	MaxShoppingListItemNoteLength     = 500
)

// ShoppingListItem is one line on a shopping list. It deliberately carries no group id: its group is
// always its list's, resolved through ShoppingListId, so the two can never disagree.
type ShoppingListItem struct {
	BaseModel
	ShoppingList    ShoppingList `json:"-"`
	ShoppingListId  uint         `gorm:"not null;index:idx_shopping_list_item_list_id" json:"shoppingListId"`
	Name            string       `gorm:"type:varchar(200);not null" json:"name"`
	Quantity        string       `gorm:"type:varchar(50)" json:"quantity"`
	Note            string       `gorm:"type:varchar(500)" json:"note"`
	IsChecked       bool         `gorm:"not null;default:false" json:"isChecked"`
	CheckedAt       *time.Time   `json:"checkedAt"`
	CheckedByUserId *uint        `json:"checkedByUserId"`
}
