package services

import (
	"cartvibe/api/internal/cell"
	"cartvibe/api/internal/cell/celltest"
	"cartvibe/api/internal/models"
	"testing"
	"time"
)

func receiveShoppingListEvent(t *testing.T, subscriber *ShoppingListSubscriber) models.ShoppingListEvent {
	t.Helper()

	select {
	case event := <-subscriber.Events:
		return event
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for a shopping list event")
		return models.ShoppingListEvent{}
	}
}

func assertNoShoppingListEvent(t *testing.T, subscriber *ShoppingListSubscriber) {
	t.Helper()

	select {
	case event := <-subscriber.Events:
		t.Fatalf("expected no event, got %+v", event)
	default:
	}
}

func TestShoppingListHubDeliversToSameGroupOnly(t *testing.T) {
	hub := NewShoppingListHub()
	first := hub.Subscribe(testCell, 1)
	second := hub.Subscribe(testCell, 1)
	otherGroup := hub.Subscribe(testCell, 2)

	hub.Publish(testCell, models.ShoppingListEvent{Type: models.ShoppingListEventItemAdded, GroupId: 1, ShoppingListId: 7})

	for _, subscriber := range []*ShoppingListSubscriber{first, second} {
		event := receiveShoppingListEvent(t, subscriber)
		if event.Type != models.ShoppingListEventItemAdded || event.ShoppingListId != 7 {
			t.Errorf("unexpected event %+v", event)
		}
	}
	assertNoShoppingListEvent(t, otherGroup)
}

func TestShoppingListHubUnsubscribeStopsDeliveryAndIsIdempotent(t *testing.T) {
	hub := NewShoppingListHub()
	subscriber := hub.Subscribe(testCell, 1)

	hub.Unsubscribe(subscriber)
	hub.Unsubscribe(subscriber)

	if hub.SubscriberCount(testCell, 1) != 0 {
		t.Errorf("expected 0 subscribers, got %d", hub.SubscriberCount(testCell, 1))
	}

	hub.Publish(testCell, models.ShoppingListEvent{Type: models.ShoppingListEventItemAdded, GroupId: 1})
	assertNoShoppingListEvent(t, subscriber)
}

func TestShoppingListHubDropsSlowSubscriberWithoutBlocking(t *testing.T) {
	hub := NewShoppingListHub()
	slow := hub.Subscribe(testCell, 1)
	healthy := hub.Subscribe(testCell, 1)

	done := make(chan struct{})
	go func() {
		// One more than the buffer: the last publish must not block on the full subscriber.
		for i := 0; i <= shoppingListSubscriberBuffer; i++ {
			hub.Publish(testCell, models.ShoppingListEvent{Type: models.ShoppingListEventItemAdded, GroupId: 1})

			// Keep the healthy subscriber drained so only the slow one overflows.
			<-healthy.Events
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Publish blocked on a full subscriber")
	}

	select {
	case <-slow.Dropped:
	default:
		t.Fatal("expected the slow subscriber to be dropped")
	}

	select {
	case <-healthy.Dropped:
		t.Fatal("the healthy subscriber must not be dropped")
	default:
	}

	if hub.SubscriberCount(testCell, 1) != 1 {
		t.Errorf("expected 1 remaining subscriber, got %d", hub.SubscriberCount(testCell, 1))
	}

	// Unsubscribing an already-dropped subscriber is safe.
	hub.Unsubscribe(slow)
}

// testCell is the cell the single-cell hub tests run in.
const testCell cell.ID = "hub-test"

// Two cells hold the same group ids: an event published in one must not reach a stream open in the other.
func TestShoppingListHubKeepsCellsApart(t *testing.T) {
	hub := NewShoppingListHub()
	inA := hub.Subscribe(celltest.IDA, 1)
	inB := hub.Subscribe(celltest.IDB, 1)

	hub.Publish(celltest.IDA, models.ShoppingListEvent{Type: models.ShoppingListEventItemAdded, GroupId: 1, ShoppingListId: 7})

	if event := receiveShoppingListEvent(t, inA); event.ShoppingListId != 7 {
		t.Errorf("cell A's stream got %+v", event)
	}
	assertNoShoppingListEvent(t, inB)

	if hub.SubscriberCount(celltest.IDA, 1) != 1 || hub.SubscriberCount(celltest.IDB, 1) != 1 {
		t.Errorf("subscriber counts: A=%d B=%d, want 1 and 1", hub.SubscriberCount(celltest.IDA, 1), hub.SubscriberCount(celltest.IDB, 1))
	}

	// Unsubscribing in A leaves B's stream on the same group id open.
	hub.Unsubscribe(inA)
	if hub.SubscriberCount(celltest.IDA, 1) != 0 || hub.SubscriberCount(celltest.IDB, 1) != 1 {
		t.Errorf("after unsubscribing in A: A=%d B=%d, want 0 and 1", hub.SubscriberCount(celltest.IDA, 1), hub.SubscriberCount(celltest.IDB, 1))
	}

	// A slow stream in A is dropped without touching B's.
	slow := hub.Subscribe(celltest.IDA, 1)
	for i := 0; i <= shoppingListSubscriberBuffer; i++ {
		hub.Publish(celltest.IDA, models.ShoppingListEvent{Type: models.ShoppingListEventItemAdded, GroupId: 1})
	}
	select {
	case <-slow.Dropped:
	case <-time.After(time.Second):
		t.Fatal("the slow stream in cell A was not dropped")
	}
	if hub.SubscriberCount(celltest.IDB, 1) != 1 {
		t.Error("dropping a stream in cell A removed cell B's")
	}
}
