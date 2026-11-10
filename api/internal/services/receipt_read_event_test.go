package services

import (
	"context"
	"testing"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

// nextReceiptReadEvent returns the event waiting for the subscriber, failing when there is none: a publish is
// synchronous, so the event is already in the channel when the call that made it has returned.
func nextReceiptReadEvent(t *testing.T, subscriber *ShoppingListSubscriber) models.ShoppingListEvent {
	t.Helper()
	select {
	case event := <-subscriber.Events:
		return event
	default:
		t.Fatal("expected a RECEIPT_READ event, got none")
		return models.ShoppingListEvent{}
	}
}

// A scan whose own answer carried the products tells the group's open pages at once, with the receipt id and
// nothing of the receipt.
func TestAnInlineReadIsAnnouncedToTheGroup(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := queueInlineReceipt(t)

	hub := GetShoppingListHub()
	subscriber := hub.Subscribe(receipt.GroupId)
	defer hub.Unsubscribe(subscriber)
	otherGroup := hub.Subscribe(receipt.GroupId + 1)
	defer hub.Unsubscribe(otherGroup)

	applied, err := NewReceiptProductExtractionService(nil).ApplyInlineRead(receipt.ID, inlineAnswerWithProducts)
	if err != nil || !applied {
		t.Fatalf("expected the products applied, got %v, %v", applied, err)
	}

	event := nextReceiptReadEvent(t, subscriber)
	if event.Type != models.ShoppingListEventReceiptRead || event.GroupId != receipt.GroupId || event.ReceiptId != receipt.ID {
		t.Errorf("unexpected event %+v", event)
	}
	if event.List != nil || event.Item != nil || event.ShoppingListId != 0 {
		t.Errorf("the event must carry the receipt id only, got %+v", event)
	}

	select {
	case leaked := <-otherGroup.Events:
		t.Errorf("event leaked to another group: %+v", leaked)
	default:
	}
}

// An answer without products changes nothing, so nothing is announced: the sweep reads the receipt later.
func TestAnInlineReadThatAppliesNothingIsNotAnnounced(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := queueInlineReceipt(t)

	hub := GetShoppingListHub()
	subscriber := hub.Subscribe(receipt.GroupId)
	defer hub.Unsubscribe(subscriber)

	applied, err := NewReceiptProductExtractionService(nil).ApplyInlineRead(receipt.ID, `{"name": "Edeka", "amount": 12.5}`)
	if err != nil || applied {
		t.Fatalf("expected nothing applied, got %v, %v", applied, err)
	}

	select {
	case event := <-subscriber.Events:
		t.Errorf("unexpected event %+v", event)
	default:
	}
}

// The sweep announces every outcome, not only a stored read: a page waiting on a receipt whose read was put off
// (no AI configured here) or given up shows that at once too.
func TestTheSweepAnnouncesEachOutcome(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := queueInlineReceipt(t)

	hub := GetShoppingListHub()
	subscriber := hub.Subscribe(receipt.GroupId)
	defer hub.Unsubscribe(subscriber)

	processed, err := NewReceiptProductExtractionService(nil).ProcessDueExtractions(context.Background())
	if err != nil || processed != 1 {
		t.Fatalf("expected one receipt processed, got %d (%v)", processed, err)
	}

	event := nextReceiptReadEvent(t, subscriber)
	if event.Type != models.ShoppingListEventReceiptRead || event.ReceiptId != receipt.ID {
		t.Errorf("unexpected event %+v", event)
	}
}
