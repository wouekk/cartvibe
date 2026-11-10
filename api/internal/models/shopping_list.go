package models

// MaxShoppingListNameLength is the longest list name, in characters. SQLite does not enforce the
// column's size, so the upsert command's check is the only limit.
const MaxShoppingListNameLength = 100

// ShoppingList is a named, long-lived list (e.g. "Supermarket") belonging to a group. Items are
// crossed off and re-added over time rather than the list being recreated per shopping trip.
type ShoppingList struct {
	BaseModel
	Group   Group              `json:"-"`
	GroupId uint               `gorm:"not null;index:idx_shopping_list_group_id" json:"groupId"`
	Name    string             `gorm:"type:varchar(100);not null" json:"name"`
	Items   []ShoppingListItem `json:"items"`
}
