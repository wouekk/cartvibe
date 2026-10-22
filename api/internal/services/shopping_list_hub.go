package services

import (
	"cartvibe/api/internal/models"
	"sync"
)

// shoppingListSubscriberBuffer is how many events a subscriber may fall behind before it is dropped.
// Dropping is safe: the client reconnects and refetches, which is also how it recovers from any
// other disconnect.
const shoppingListSubscriberBuffer = 32

// ShoppingListSubscriber is one open SSE stream. Events is never closed — a publisher racing an
// unsubscribe could otherwise send on a closed channel. Dropped closes instead, once, when the hub
// gives up on a subscriber that stopped draining.
type ShoppingListSubscriber struct {
	GroupId  uint
	Events   chan models.ShoppingListEvent
	Dropped  chan struct{}
	dropOnce sync.Once
}

func (subscriber *ShoppingListSubscriber) markDropped() {
	subscriber.dropOnce.Do(func() {
		close(subscriber.Dropped)
	})
}

// ShoppingListHub fans shopping list events out to the SSE streams open on the same group. It is
// in-process, which is correct for the single-container deployment; running several API replicas
// would need a shared bus (e.g. Redis pub/sub) behind the same Publish/Subscribe surface.
type ShoppingListHub struct {
	mu          sync.RWMutex
	subscribers map[uint]map[*ShoppingListSubscriber]struct{}
}

func NewShoppingListHub() *ShoppingListHub {
	return &ShoppingListHub{
		subscribers: make(map[uint]map[*ShoppingListSubscriber]struct{}),
	}
}

var shoppingListHub = NewShoppingListHub()

func GetShoppingListHub() *ShoppingListHub {
	return shoppingListHub
}

func (hub *ShoppingListHub) Subscribe(groupId uint) *ShoppingListSubscriber {
	subscriber := &ShoppingListSubscriber{
		GroupId: groupId,
		Events:  make(chan models.ShoppingListEvent, shoppingListSubscriberBuffer),
		Dropped: make(chan struct{}),
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	if hub.subscribers[groupId] == nil {
		hub.subscribers[groupId] = make(map[*ShoppingListSubscriber]struct{})
	}
	hub.subscribers[groupId][subscriber] = struct{}{}

	return subscriber
}

// Unsubscribe is idempotent, so a stream can always defer it even after the hub dropped it.
func (hub *ShoppingListHub) Unsubscribe(subscriber *ShoppingListSubscriber) {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	hub.removeLocked(subscriber)
}

func (hub *ShoppingListHub) removeLocked(subscriber *ShoppingListSubscriber) {
	groupSubscribers := hub.subscribers[subscriber.GroupId]
	if groupSubscribers == nil {
		return
	}

	delete(groupSubscribers, subscriber)
	if len(groupSubscribers) == 0 {
		delete(hub.subscribers, subscriber.GroupId)
	}
}

// Publish never blocks: a write request must not stall on a slow phone. A subscriber whose buffer is
// full is dropped instead.
func (hub *ShoppingListHub) Publish(event models.ShoppingListEvent) {
	var dropped []*ShoppingListSubscriber

	hub.mu.RLock()
	for subscriber := range hub.subscribers[event.GroupId] {
		select {
		case subscriber.Events <- event:
		default:
			dropped = append(dropped, subscriber)
		}
	}
	hub.mu.RUnlock()

	if len(dropped) == 0 {
		return
	}

	hub.mu.Lock()
	for _, subscriber := range dropped {
		hub.removeLocked(subscriber)
	}
	hub.mu.Unlock()

	for _, subscriber := range dropped {
		subscriber.markDropped()
	}
}

// SubscriberCount reports how many streams are open on a group.
func (hub *ShoppingListHub) SubscriberCount(groupId uint) int {
	hub.mu.RLock()
	defer hub.mu.RUnlock()

	return len(hub.subscribers[groupId])
}
