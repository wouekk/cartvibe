package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeLog(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "app.log")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

const sampleLog = `App2026/10/20 10:00:00 log.go:52: [a.go:1] INFO:  started
App2026/10/20 10:00:01 log.go:52: [b.go:2] ERROR:  boom
second line of the error
App2026/10/20 10:00:02 log.go:52: [c.go:3] INFO:  done
`

func TestReadAppLog_NewestFirstWithContinuationLines(t *testing.T) {
	entries, err := ReadAppLog(writeLog(t, sampleLog), "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 3 || entries[0].Message != "done" || entries[2].Message != "started" {
		t.Fatalf("unexpected entries: %+v", entries)
	}
	if entries[1].Level != "ERROR" || entries[1].Message != "boom\nsecond line of the error" {
		t.Errorf("continuation not joined: %+v", entries[1])
	}
	if entries[0].Timestamp != "2026/10/20 10:00:02" {
		t.Errorf("timestamp: %q", entries[0].Timestamp)
	}
}

func TestReadAppLog_LevelFilterAndLimit(t *testing.T) {
	path := writeLog(t, sampleLog)

	errorsOnly, _ := ReadAppLog(path, "error", 10)
	if len(errorsOnly) != 1 || errorsOnly[0].Level != "ERROR" {
		t.Errorf("level filter: %+v", errorsOnly)
	}

	limited, _ := ReadAppLog(path, "", 1)
	if len(limited) != 1 || limited[0].Message != "done" {
		t.Errorf("limit: %+v", limited)
	}
}

func TestReadAppLog_MissingFileIsEmptyNotNil(t *testing.T) {
	entries, err := ReadAppLog(filepath.Join(t.TempDir(), "nope.log"), "", 0)
	if err != nil || entries == nil || len(entries) != 0 {
		t.Errorf("expected empty non-nil, got %#v, %v", entries, err)
	}
}

func TestReadAppLog_OnlyReadsTheTail(t *testing.T) {
	filler := strings.Repeat("App2026/10/20 09:00:00 log.go:52: [x.go:1] INFO:  filler line to pad the file out\n", 20000)
	path := writeLog(t, filler+sampleLog)

	entries, err := ReadAppLog(path, "ERROR", 5)
	if err != nil || len(entries) != 1 || entries[0].Message != "boom\nsecond line of the error" {
		t.Errorf("tail read: %+v, %v", entries, err)
	}
}
