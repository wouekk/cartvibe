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

// AfterDelete runs a recursive remove on the group's folder, which is data/<id>. The group's name is no part of
// it, so a name written to climb out of the data directory (CWE-22) removes the group's own folder and nothing
// else.
func TestGroup_AfterDelete_ANameNeverReachesThePath(t *testing.T) {
	// The sentinel is where the crafted name below would resolve to, were it part of the path (ten "../" climb
	// out of <cwd>/data to the filesystem root, then into the temp directory's name).
	sentinel := filepath.Join(os.TempDir(), "cv_model_afterdelete_sentinel")
	if err := os.MkdirAll(sentinel, 0o755); err != nil {
		t.Fatalf("setup sentinel: %v", err)
	}
	defer os.RemoveAll(sentinel)
	marker := filepath.Join(sentinel, "marker.txt")
	if err := os.WriteFile(marker, []byte("keep"), 0o644); err != nil {
		t.Fatalf("setup marker: %v", err)
	}

	// The group's own folder, with a file in it.
	own, err := utils.BuildGroupPathString("999999")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(own, 0o755); err != nil {
		t.Fatalf("setup the group's folder: %v", err)
	}
	defer os.RemoveAll(own)
	if err := os.WriteFile(filepath.Join(own, "7"), []byte("a receipt file"), 0o644); err != nil {
		t.Fatal(err)
	}

	group := Group{
		BaseModel: BaseModel{ID: 999999},
		Name:      "../../../../../../../../../../tmp/cv_model_afterdelete_sentinel",
	}

	if err := group.AfterDelete(nil); err != nil {
		t.Fatalf("deleting a group with an odd name failed: %v", err)
	}

	if _, err := os.Stat(own); !os.IsNotExist(err) {
		t.Fatalf("the group's own folder was not removed")
	}
	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("something outside the group's folder was touched: %v", err)
	}
}
