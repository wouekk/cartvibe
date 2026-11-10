package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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

// The file is JSON lines since 2026-11 (logging.InitLog); a file that outlived the update starts with text lines.
const jsonLog = `App2026/10/20 10:00:00 log.go:52: [a.go:1] INFO:  from before the update
{"time":"2026-11-10T09:00:00Z","level":"INFO","msg":"started","source":"main.go:10"}
{"time":"2026-11-10T09:00:01Z","level":"ERROR","msg":"boom\nsecond line of the error","source":"b.go:2"}
{"time":"2026-11-10T09:00:02Z","level":"FATAL","msg":"cannot go on","source":"c.go:3"}
`

func TestReadAppLog_ReadsJsonLinesAndTheTextBeforeThem(t *testing.T) {
	entries, err := ReadAppLog(writeLog(t, jsonLog), "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 4 {
		t.Fatalf("four messages, got %+v", entries)
	}
	if entries[0].Level != "FATAL" || entries[0].Message != "cannot go on" {
		t.Errorf("newest first: %+v", entries[0])
	}
	if entries[1].Level != "ERROR" || entries[1].Message != "boom\nsecond line of the error" {
		t.Errorf("a message of two lines is one entry: %+v", entries[1])
	}
	if entries[3].Message != "from before the update" || entries[3].Timestamp != "2026/10/20 10:00:00" {
		t.Errorf("the text line is still read: %+v", entries[3])
	}
	// The viewer keeps the shape the text log printed, in the server's time zone.
	moment, _ := time.Parse(time.RFC3339, "2026-11-10T09:00:00Z")
	if entries[2].Timestamp != moment.Local().Format("2006/01/02 15:04:05") {
		t.Errorf("timestamp: %q", entries[2].Timestamp)
	}

	errorsOnly, _ := ReadAppLog(writeLog(t, jsonLog), "error", 10)
	if len(errorsOnly) != 1 || errorsOnly[0].Message != "boom\nsecond line of the error" {
		t.Errorf("level filter: %+v", errorsOnly)
	}
}

// At its size cap the log starts a new file and keeps the one before as "<path>.1".
func TestReadAppLog_TakesTheRestFromTheFileBefore(t *testing.T) {
	path := writeLog(t, `{"time":"2026-11-10T09:00:05Z","level":"INFO","msg":"newest","source":"a.go:1"}`+"\n")
	older := `{"time":"2026-11-10T09:00:03Z","level":"INFO","msg":"older","source":"a.go:1"}` + "\n" +
		`{"time":"2026-11-10T09:00:04Z","level":"ERROR","msg":"old error","source":"a.go:1"}` + "\n"
	if err := os.WriteFile(path+".1", []byte(older), 0644); err != nil {
		t.Fatal(err)
	}

	entries, err := ReadAppLog(path, "", 0)
	if err != nil || len(entries) != 3 || entries[0].Message != "newest" || entries[1].Message != "old error" || entries[2].Message != "older" {
		t.Errorf("newest first across both files: %+v, %v", entries, err)
	}

	limited, _ := ReadAppLog(path, "", 1)
	if len(limited) != 1 || limited[0].Message != "newest" {
		t.Errorf("the file before is not read when the new one is enough: %+v", limited)
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
