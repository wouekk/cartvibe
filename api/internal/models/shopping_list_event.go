package models

// ShoppingListEventType names a shopping list mutation broadcast over the group's SSE stream.
//
// It is a plain string on the API contract, never an enum: a closed enum on a payload a released
// client deserializes is how two mobile login outages happened, and new event types are expected.
type ShoppingListEventType string

const (
	ShoppingListEventListCreated    ShoppingListEventType = "LIST_CREATED"
	ShoppingListEventListUpdated    ShoppingListEventType = "LIST_UPDATED"
	ShoppingListEventListDeleted    ShoppingListEventType = "LIST_DELETED"
	ShoppingListEventItemAdded      ShoppingListEventType = "ITEM_ADDED"
	ShoppingListEventItemUpdated    ShoppingListEventType = "ITEM_UPDATED"
	ShoppingListEventItemToggled    ShoppingListEventType = "ITEM_TOGGLED"
	ShoppingListEventItemDeleted    ShoppingListEventType = "ITEM_DELETED"
	ShoppingListEventCheckedCleared ShoppingListEventType = "CHECKED_CLEARED"
	// TRIPS_CHANGED says a list's shopping trips changed. It carries nothing else: a trip shows receipt
	// details that need receipt permissions the stream does not check, so clients refetch them.
	ShoppingListEventTripsChanged ShoppingListEventType = "TRIPS_CHANGED"
)

// ShoppingListEvent carries the full changed entity so a client can apply it without refetching.
// List is set for LIST_CREATED / LIST_UPDATED, Item for the ITEM_* events, and ItemIds for
// CHECKED_CLEARED. Applying an event is an idempotent upsert/remove by id.
type ShoppingListEvent struct {
	Type           ShoppingListEventType `json:"type"`
	GroupId        uint                  `json:"groupId"`
	ShoppingListId uint                  `json:"shoppingListId"`
	List           *ShoppingList         `json:"list,omitempty"`
	Item           *ShoppingListItem     `json:"item,omitempty"`
	ItemIds        []uint                `json:"itemIds,omitempty"`
}
