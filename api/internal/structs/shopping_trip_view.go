package structs

import (
	"time"

	"github.com/shopspring/decimal"
)

// ShoppingTripReceipt is the part of a trip's receipt a list shows.
type ShoppingTripReceipt struct {
	Id     uint            `json:"id"`
	Name   string          `json:"name"`
	Date   time.Time       `json:"date"`
	Amount decimal.Decimal `json:"amount"`
}

// ShoppingTripView is a trip as a list shows it.
type ShoppingTripView struct {
	Id             uint      `json:"id"`
	ShoppingListId uint      `json:"shoppingListId"`
	CreatedAt      time.Time `json:"createdAt"`
	// Status is the trip's ShoppingTripStatus, a plain string, never an enum.
	Status    string `json:"status"`
	LastError string `json:"lastError"`
	// WaitingForPhoto is true while an uploaded photo has not become a receipt yet.
	WaitingForPhoto bool `json:"waitingForPhoto"`
	// Receipt is nil while the photo waits, and for a receipt the caller may not see.
	Receipt          *ShoppingTripReceipt `json:"receipt"`
	PlannedItemCount int                  `json:"plannedItemCount"`
	// The comparison's result, set once the trip is DONE and the receipt is visible to the caller.
	ProductCount      int              `json:"productCount"`
	UnplannedAmount   *decimal.Decimal `json:"unplannedAmount"`
	UnplannedProducts []string         `json:"unplannedProducts"`
}
