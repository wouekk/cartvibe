package cell

import (
	"context"
	"errors"
	"testing"

	"gorm.io/gorm"
)

// These tests compare *gorm.DB pointers only, so they need no database driver.

func TestStandaloneManagerReturnsTheSingleDatabase(t *testing.T) {
	db := &gorm.DB{}
	manager, err := NewStandaloneManager(db)
	if err != nil {
		t.Fatal(err)
	}

	implicit, err := manager.Implicit()
	if err != nil {
		t.Fatal(err)
	}
	opened, err := manager.Open(context.Background(), StandaloneID)
	if err != nil {
		t.Fatal(err)
	}

	for name, handle := range map[string]Handle{"Implicit": implicit, "Open": opened} {
		if handle.DB() != db {
			t.Errorf("%s: handle does not carry the standalone database", name)
		}
		if handle.ID() != StandaloneID {
			t.Errorf("%s: id = %q, want %q", name, handle.ID(), StandaloneID)
		}
		if handle.IsZero() {
			t.Errorf("%s: handle is zero", name)
		}
	}
}

func TestStandaloneManagerRefusesOtherCells(t *testing.T) {
	manager, err := NewStandaloneManager(&gorm.DB{})
	if err != nil {
		t.Fatal(err)
	}

	handle, err := manager.Open(context.Background(), "someone-else")
	if !errors.Is(err, ErrUnknownCell) {
		t.Fatalf("expected ErrUnknownCell, got %v", err)
	}
	if !handle.IsZero() || handle.DB() != nil {
		t.Error("a refused Open must return the zero Handle")
	}
}

func TestStandaloneManagerNeedsADatabase(t *testing.T) {
	if _, err := NewStandaloneManager(nil); err == nil {
		t.Error("expected an error for a nil database")
	}
}

func TestZeroHandleCarriesNothing(t *testing.T) {
	var handle Handle
	if !handle.IsZero() || handle.DB() != nil || handle.ID() != "" {
		t.Error("the zero Handle must belong to no cell")
	}
}

func TestStaticManagerKeepsCellsApart(t *testing.T) {
	dbA, dbB := &gorm.DB{}, &gorm.DB{}
	manager, err := NewStaticManager(map[ID]*gorm.DB{"a": dbA, "b": dbB})
	if err != nil {
		t.Fatal(err)
	}

	a, err := manager.Open(context.Background(), "a")
	if err != nil {
		t.Fatal(err)
	}
	b, err := manager.Open(context.Background(), "b")
	if err != nil {
		t.Fatal(err)
	}
	if a.DB() != dbA || b.DB() != dbB || a.DB() == b.DB() {
		t.Error("each handle must reach only its own cell's database")
	}

	if _, err := manager.Open(context.Background(), "c"); !errors.Is(err, ErrUnknownCell) {
		t.Errorf("expected ErrUnknownCell, got %v", err)
	}
	if _, err := manager.Implicit(); !errors.Is(err, ErrNoImplicitCell) {
		t.Errorf("a multi-cell manager has no implicit cell, got %v", err)
	}
}

func TestStaticManagerRejectsBadInput(t *testing.T) {
	if _, err := NewStaticManager(map[ID]*gorm.DB{"a": nil}); err == nil {
		t.Error("expected an error for a nil database")
	}
	if _, err := NewStaticManager(map[ID]*gorm.DB{"": &gorm.DB{}}); err == nil {
		t.Error("expected an error for an empty id")
	}
}
