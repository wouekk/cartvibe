package models

import (
	"slices"
	"time"

	"github.com/shopspring/decimal"
)

// Maximum lengths, matching the column definitions below (see MaxShoppingListNameLength).
const (
	MaxShoppingListItemNameLength     = 200
	MaxShoppingListItemQuantityLength = 50
	MaxShoppingListItemNoteLength     = 500
)

// ShoppingListUnits are the units an item's amount may be in. The unit is a plain string on the API
// contract, never an enum, so adding one here can't break a released client's deserializer; clients
// show an unrecognized unit as-is. Keep desktop's SHOPPING_LIST_UNITS in step.
var ShoppingListUnits = []string{"pcs", "kg", "g", "l", "ml", "pack", "bottle", "can", "box", "bag", "jar", "bunch", "dozen"}

func IsShoppingListUnit(unit string) bool {
	return slices.Contains(ShoppingListUnits, unit)
}

// ShoppingListItem is one line on a shopping list. It deliberately carries no group id: its group is
// always its list's, resolved through ShoppingListId, so the two can never disagree.
//
// How much to buy is Amount + Unit (e.g. 1.5 kg); a nil Amount means none was given. Quantity is the
// original free-text field: still accepted and shown, so items written before Amount existed keep
// their text, but superseded once an amount is set.
type ShoppingListItem struct {
	BaseModel
	ShoppingList    ShoppingList     `json:"-"`
	ShoppingListId  uint             `gorm:"not null;index:idx_shopping_list_item_list_id" json:"shoppingListId"`
	Name            string           `gorm:"type:varchar(200);not null" json:"name"`
	Amount          *decimal.Decimal `gorm:"type:decimal(10,3)" json:"amount"`
	Unit            string           `gorm:"type:varchar(20);not null;default:''" json:"unit"`
	Quantity        string           `gorm:"type:varchar(50)" json:"quantity"`
	Note            string           `gorm:"type:varchar(500)" json:"note"`
	IsChecked       bool             `gorm:"not null;default:false" json:"isChecked"`
	CheckedAt       *time.Time       `json:"checkedAt"`
	CheckedByUserId *uint            `json:"checkedByUserId"`
	// Health and seasonality tags, filled in by the classification sweep shortly after the item is added.
	FoodClassification `gorm:"embedded"`
}
