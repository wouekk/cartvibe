package services

import (
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
	first := hub.Subscribe(1)
	second := hub.Subscribe(1)
	otherGroup := hub.Subscribe(2)

	hub.Publish(models.ShoppingListEvent{Type: models.ShoppingListEventItemAdded, GroupId: 1, ShoppingListId: 7})

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
	subscriber := hub.Subscribe(1)

	hub.Unsubscribe(subscriber)
	hub.Unsubscribe(subscriber)

	if hub.SubscriberCount(1) != 0 {
		t.Errorf("expected 0 subscribers, got %d", hub.SubscriberCount(1))
	}

	hub.Publish(models.ShoppingListEvent{Type: models.ShoppingListEventItemAdded, GroupId: 1})
	assertNoShoppingListEvent(t, subscriber)
}

func TestShoppingListHubDropsSlowSubscriberWithoutBlocking(t *testing.T) {
	hub := NewShoppingListHub()
	slow := hub.Subscribe(1)
	healthy := hub.Subscribe(1)

	done := make(chan struct{})
	go func() {
		// One more than the buffer: the last publish must not block on the full subscriber.
		for i := 0; i <= shoppingListSubscriberBuffer; i++ {
			hub.Publish(models.ShoppingListEvent{Type: models.ShoppingListEventItemAdded, GroupId: 1})

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

	if hub.SubscriberCount(1) != 1 {
		t.Errorf("expected 1 remaining subscriber, got %d", hub.SubscriberCount(1))
	}

	// Unsubscribing an already-dropped subscriber is safe.
	hub.Unsubscribe(slow)
}

// The server stopping: every open stream is ended (so Shutdown does not wait for requests that never finish), a
// stream that arrives afterwards is ended at once, and publishing into a closed hub does nothing.
func TestShoppingListHubCloseEndsEveryStreamAndRefusesNewOnes(t *testing.T) {
	hub := NewShoppingListHub()
	first := hub.Subscribe(1)
	second := hub.Subscribe(2)

	hub.Close()
	hub.Close()

	for _, subscriber := range []*ShoppingListSubscriber{first, second} {
		select {
		case <-subscriber.Dropped:
		case <-time.After(time.Second):
			t.Fatal("an open stream was not ended by Close")
		}
	}
	if hub.SubscriberCount(1) != 0 || hub.SubscriberCount(2) != 0 {
		t.Error("a closed hub still counts subscribers")
	}

	late := hub.Subscribe(1)
	select {
	case <-late.Dropped:
	case <-time.After(time.Second):
		t.Fatal("a stream opened after Close was not ended")
	}

	hub.Publish(models.ShoppingListEvent{Type: models.ShoppingListEventItemAdded, GroupId: 1})
	hub.Unsubscribe(first)
	hub.Unsubscribe(late)
}
