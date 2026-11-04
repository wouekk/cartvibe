package models

import (
	"cartvibe/api/internal/utils"
	"os"
	"path/filepath"
	"testing"
)

func TestGroup_AfterDelete_NoOpWhenIdZero(t *testing.T) {
	// With a zero ID the hook returns immediately without touching the filesystem.
	group := Group{Name: "Test"}
	err := group.AfterDelete(nil)
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
}

func TestGroup_AfterDelete_RemovesGroupPath(t *testing.T) {
	// The group path does not exist, so utils.RemoveAllInDataDir is a no-op that
	// returns nil.
	group := Group{BaseModel: BaseModel{ID: 1}, Name: "Test"}
	err := group.AfterDelete(nil)
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
}

// AfterDelete runs a recursive remove on the group's name-derived storage path. A
// group whose name resolves outside the data directory (CWE-22) must be refused so
// the delete hook can never recursively remove an arbitrary directory.
func TestGroup_AfterDelete_RejectsPathTraversalName(t *testing.T) {
	// The sentinel is placed at exactly the location the crafted name below
	// resolves to (10 "../" climb out of <cwd>/data to the filesystem root, then
	// into /tmp), so the "not deleted" assertion is meaningful: without the guard
	// AfterDelete's recursive remove would wipe this directory.
	sentinel := "/tmp/cv_model_afterdelete_sentinel"
	if err := os.MkdirAll(sentinel, 0o755); err != nil {
		t.Fatalf("setup sentinel: %v", err)
	}
	defer os.RemoveAll(sentinel)
	if err := os.WriteFile(filepath.Join(sentinel, "marker.txt"), []byte("keep"), 0o644); err != nil {
		t.Fatalf("setup marker: %v", err)
	}

	group := Group{
		BaseModel: BaseModel{ID: 999999},
		Name:      "../../../../../../../../../../tmp/cv_model_afterdelete_sentinel",
	}

	if err := group.AfterDelete(nil); err == nil {
		t.Fatalf("expected AfterDelete to reject a path-traversal group name")
	}

	if _, err := os.Stat(sentinel); os.IsNotExist(err) {
		t.Fatalf("sentinel dir was recursively deleted — traversal guard failed")
	}
}
