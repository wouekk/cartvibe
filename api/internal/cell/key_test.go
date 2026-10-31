package cell

import (
	"testing"

	"gorm.io/gorm"
)

func TestCellKeySeparatesCellsThatShareAnID(t *testing.T) {
	a := KeyIn(ID("a"), uint(1))
	b := KeyIn(ID("b"), uint(1))
	if a == b {
		t.Fatal("the same id in two cells must be two keys")
	}

	held := map[CellKey[uint]]string{a: "from a"}
	if _, ok := held[b]; ok {
		t.Error("a map keyed by CellKey returned cell a's entry for cell b")
	}
	if held[KeyIn(ID("a"), uint(1))] != "from a" {
		t.Error("the same cell and id must be the same key")
	}
}

func TestKeyOfUsesTheHandlesCell(t *testing.T) {
	manager, err := NewStandaloneManager(&gorm.DB{})
	if err != nil {
		t.Fatal(err)
	}
	h, err := manager.Implicit()
	if err != nil {
		t.Fatal(err)
	}
	if got := KeyOf(h, "x"); got.Cell != StandaloneID || got.ID != "x" {
		t.Errorf("KeyOf = %+v", got)
	}
	if got := KeyOf(Handle{}, 7); got.Cell != "" {
		t.Errorf("the zero handle belongs to no cell, got %+v", got)
	}
}
