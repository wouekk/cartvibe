package utils

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsSafePathComponent(t *testing.T) {
	tests := map[string]bool{
		"My Receipts":         true,
		"Reporting Load Test": true,
		"group-123":           true,
		"Mom & Dad's":         true,
		"":                    false,
		".":                   false,
		"..":                  false,
		"../etc":              false,
		"a/b":                 false,
		"a\\b":                false,
		"/etc/passwd":         false,
		"foo/../bar":          false,
	}

	for name, want := range tests {
		t.Run(name, func(t *testing.T) {
			if got := IsSafePathComponent(name); got != want {
				PrintTestError(t, got, want)
			}
		})
	}

	if IsSafePathComponent("foo\x00bar") {
		PrintTestError(t, true, false)
	}
}

func TestBuildGroupPathString_IsTheIdUnderTheDataDir(t *testing.T) {
	dataDir, err := GetDataDir()
	if err != nil {
		t.Fatalf("GetDataDir: %v", err)
	}

	got, err := BuildGroupPathString("42")
	if err != nil {
		t.Fatalf("unexpected error for an id: %v", err)
	}

	want := filepath.Join(dataDir, "42")
	if got != want {
		PrintTestError(t, got, want)
	}
}

// A household's folder and a file in it are named by ids alone. Anything that is not a number is refused, so
// nothing a person typed (a household's name, an upload's name) can ever be part of a path.
func TestReceiptFilePaths_TakeNumbersOnly(t *testing.T) {
	notIds := []string{
		"", " ", "42-Home", "4 2", "-1", "1.5", "0x10", "..", "../42", "42/..", "42/7", "42\\7", "abc",
		"../../../../../../../../../../tmp/x", "４２",
	}

	for _, value := range notIds {
		t.Run(value, func(t *testing.T) {
			if got, err := BuildGroupPathString(value); err == nil {
				PrintTestError(t, got, "error: not a number")
			}
			if got, err := BuildReceiptFilePathString(value, "7"); err == nil {
				PrintTestError(t, got, "error: the household is not a number")
			}
			if got, err := BuildReceiptFilePathString("42", value); err == nil {
				PrintTestError(t, got, "error: the file is not a number")
			}
		})
	}
}

func TestBuildReceiptFilePathString_IsHouseholdThenFile(t *testing.T) {
	dataDir, err := GetDataDir()
	if err != nil {
		t.Fatalf("GetDataDir: %v", err)
	}

	got, err := BuildReceiptFilePathString("42", "1007")
	if err != nil {
		t.Fatalf("unexpected error for two ids: %v", err)
	}

	want := filepath.Join(dataDir, "42", "1007")
	if got != want {
		PrintTestError(t, got, want)
	}
}

// The centralized data-file helpers must refuse any path outside the data dir
// and leave an out-of-tree target untouched.
func TestDataFileHelpers_RejectPathsOutsideDataDir(t *testing.T) {
	sentinel := filepath.Join(os.TempDir(), "cv_utils_out_sentinel")
	if err := os.MkdirAll(sentinel, 0o755); err != nil {
		t.Fatalf("setup sentinel: %v", err)
	}
	defer os.RemoveAll(sentinel)
	marker := filepath.Join(sentinel, "marker.txt")
	if err := os.WriteFile(marker, []byte("keep"), 0o644); err != nil {
		t.Fatalf("setup marker: %v", err)
	}

	assertRejected := func(name string, err error) {
		if err == nil {
			PrintTestError(t, name+" accepted an out-of-tree path", "error")
		}
	}

	assertRejected("MakeDataDirectory", MakeDataDirectory(filepath.Join(sentinel, "child")))
	assertRejected("RemoveDataPath", RemoveDataPath(marker))
	assertRejected("RemoveAllInDataDir", RemoveAllInDataDir(sentinel))
	assertRejected("RenameDataPath(dst-outside)", RenameDataPath(marker, filepath.Join(os.TempDir(), "cv_utils_out_moved")))
	assertRejected("WriteDataFile", WriteDataFile(filepath.Join(sentinel, "w.txt"), []byte("x")))
	assertRejected("EnsureDataDirectory", EnsureDataDirectory(filepath.Join(sentinel, "d")))
	_, existsErr := DataPathExists(marker)
	assertRejected("DataPathExists", existsErr)
	_, readErr := ReadDataFile(marker)
	assertRejected("ReadDataFile", readErr)

	if _, err := os.Stat(sentinel); os.IsNotExist(err) {
		t.Fatalf("out-of-tree sentinel was removed — containment guard failed")
	}
	if _, err := os.Stat(marker); os.IsNotExist(err) {
		t.Fatalf("out-of-tree marker was removed — containment guard failed")
	}
}

func TestDataFileHelpers_AllowPathsInsideDataDir(t *testing.T) {
	dataDir, err := GetDataDir()
	if err != nil {
		t.Fatalf("GetDataDir: %v", err)
	}
	createdDataDir := !FileExists(dataDir)
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("setup data dir: %v", err)
	}
	if createdDataDir {
		defer os.RemoveAll(dataDir)
	}

	dir := filepath.Join(dataDir, "cv_utils_in_dir")
	defer os.RemoveAll(dir)
	if err := MakeDataDirectory(dir); err != nil {
		t.Fatalf("MakeDataDirectory in data dir failed: %v", err)
	}
	if !FileExists(dir) {
		t.Fatalf("expected directory to be created")
	}

	if exists, err := DataPathExists(dir); err != nil || !exists {
		t.Fatalf("DataPathExists on a created dir: %v, %v", exists, err)
	}

	renamed := filepath.Join(dataDir, "cv_utils_in_dir_renamed")
	defer os.RemoveAll(renamed)
	if exists, err := DataPathExists(renamed); err != nil || exists {
		t.Fatalf("DataPathExists on a missing dir: %v, %v", exists, err)
	}
	if err := RenameDataPath(dir, renamed); err != nil {
		t.Fatalf("RenameDataPath in data dir failed: %v", err)
	}

	if err := RemoveAllInDataDir(renamed); err != nil {
		t.Fatalf("RemoveAllInDataDir in data dir failed: %v", err)
	}
	if FileExists(renamed) {
		t.Fatalf("expected directory to be removed")
	}

	// WriteDataFile + ReadDataFile round-trip inside the data dir.
	file := filepath.Join(dataDir, "cv_utils_in_file.txt")
	defer os.RemoveAll(file)
	if err := WriteDataFile(file, []byte("hello")); err != nil {
		t.Fatalf("WriteDataFile in data dir failed: %v", err)
	}
	got, err := ReadDataFile(file)
	if err != nil {
		t.Fatalf("ReadDataFile in data dir failed: %v", err)
	}
	if string(got) != "hello" {
		PrintTestError(t, string(got), "hello")
	}

	// EnsureDataDirectory tolerates an already-existing directory.
	if err := EnsureDataDirectory(dataDir); err != nil {
		t.Fatalf("EnsureDataDirectory on an existing dir failed: %v", err)
	}
}

// ReadDataFile must surface a real read error (unlike utils.ReadFile, which
// swallows errors as nil, nil).
func TestReadDataFile_PropagatesReadError(t *testing.T) {
	dataDir, err := GetDataDir()
	if err != nil {
		t.Fatalf("GetDataDir: %v", err)
	}
	createdDataDir := !FileExists(dataDir)
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("setup data dir: %v", err)
	}
	if createdDataDir {
		defer os.RemoveAll(dataDir)
	}

	if _, err := ReadDataFile(filepath.Join(dataDir, "definitely-missing.txt")); err == nil {
		t.Fatalf("expected ReadDataFile to propagate a read error for a missing file")
	}
}
