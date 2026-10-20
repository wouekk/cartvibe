package models

import (
	"encoding/json"
	"time"
)

// ShoppingTripStatus is where a trip's analysis stands. A plain string on the API, never an enum:
// new states may follow.
type ShoppingTripStatus string

const (
	// Waiting for the next sweep: for its photo to be scanned, its receipt's products, or the comparison.
	SHOPPING_TRIP_PENDING ShoppingTripStatus = "PENDING"
	// Claimed by a sweep and being worked on now.
	SHOPPING_TRIP_RUNNING ShoppingTripStatus = "RUNNING"
	SHOPPING_TRIP_DONE    ShoppingTripStatus = "DONE"
	// The AI could not be reached (not configured, out of credits, down); retried later.
	SHOPPING_TRIP_UNAVAILABLE ShoppingTripStatus = "UNAVAILABLE"
	// Gave up; a person can ask for another try.
	SHOPPING_TRIP_FAILED ShoppingTripStatus = "FAILED"
)

// ShoppingTripPlannedItem is one list item that counted as planned when the receipt was attached.
type ShoppingTripPlannedItem struct {
	Id   uint   `json:"id"`
	Name string `json:"name"`
}

// ShoppingTrip is a receipt attached to a shopping list: what was bought, compared with what was
// planned. A trip starts either from an existing receipt, or from a photo uploaded from the list that
// is kept (PhotoPath) until the AI can turn it into a receipt.
//
// PlannedItems is a snapshot taken at attach time, because the list keeps changing afterwards: the
// items still open plus the ones crossed off around the trip.
type ShoppingTrip struct {
	BaseModel
	ShoppingList   ShoppingList `json:"-"`
	ShoppingListId uint         `gorm:"not null;index:idx_shopping_trip_list_id" json:"shoppingListId"`
	// ReceiptId is nil while an uploaded photo waits to be scanned. A receipt is on one trip at most.
	ReceiptId    *uint  `gorm:"uniqueIndex:idx_shopping_trip_receipt_id" json:"receiptId"`
	PlannedItems string `gorm:"type:text;not null" json:"-"`
	// The uploaded photo, inside the data directory, until it becomes a receipt.
	PhotoPath string `gorm:"type:varchar(500);not null;default:''" json:"-"`
	PhotoName string `gorm:"type:varchar(255);not null;default:''" json:"-"`

	Status        ShoppingTripStatus `gorm:"type:varchar(20);not null;index:idx_shopping_trip_due,priority:1" json:"status"`
	NextAttemptAt time.Time          `gorm:"not null;index:idx_shopping_trip_due,priority:2" json:"-"`
	// QueuedAt starts the retry window; asking for another try restarts it.
	QueuedAt  time.Time `gorm:"not null" json:"-"`
	Attempts  int       `gorm:"not null;default:0" json:"-"`
	LastError string    `gorm:"type:varchar(500);not null;default:''" json:"lastError"`
}

// GetPlannedItems reads the snapshot; an unreadable one counts as an empty list.
func (trip ShoppingTrip) GetPlannedItems() []ShoppingTripPlannedItem {
	items := []ShoppingTripPlannedItem{}
	if json.Unmarshal([]byte(trip.PlannedItems), &items) != nil || items == nil {
		return []ShoppingTripPlannedItem{}
	}
	return items
}

// SetPlannedItems writes the snapshot.
func (trip *ShoppingTrip) SetPlannedItems(items []ShoppingTripPlannedItem) {
	if items == nil {
		items = []ShoppingTripPlannedItem{}
	}
	bytes, _ := json.Marshal(items)
	trip.PlannedItems = string(bytes)
}
