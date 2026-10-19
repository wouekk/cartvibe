package models

// MaxShoppingListNameLength matches the column definition below. Writing a longer name fails at the
// database on MySQL/Postgres, so the upsert command rejects an over-length one up front.
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
