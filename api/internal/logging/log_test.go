package logging

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLogStdWritesOneJsonLinePerMessage(t *testing.T) {
	path := filepath.Join(t.TempDir(), "logs", "app.log")
	if err := initLogAt(path, 1<<20); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		logFile.Close()
		fileLogger = nil
	})

	LogStd(LOG_LEVEL_ERROR, "could not read", 3, "files")
	LogStd(LOG_LEVEL_INFO, "a message of\ntwo lines")

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	if len(lines) != 2 {
		t.Fatalf("two messages are two lines, got %d: %q", len(lines), content)
	}

	var first, second map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &first); err != nil {
		t.Fatalf("not JSON: %q", lines[0])
	}
	if err := json.Unmarshal([]byte(lines[1]), &second); err != nil {
		t.Fatalf("not JSON: %q", lines[1])
	}

	if first["level"] != "ERROR" || first["msg"] != "could not read 3 files" {
		t.Errorf("unexpected first line: %v", first)
	}
	if source, _ := first[AppLogSourceKey].(string); !strings.HasPrefix(source, "log_test.go:") {
		t.Errorf("the source is the caller's file and line, got %q", source)
	}
	if first["time"] == nil {
		t.Error("a line carries its time")
	}
	if second["level"] != "INFO" || second["msg"] != "a message of\ntwo lines" {
		t.Errorf("unexpected second line: %v", second)
	}
}

// LogStd ends the process on FATAL, so the line is written the way LogStd writes it, without the exit.
func TestFatalIsNamedInTheFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	if err := initLogAt(path, 1<<20); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		logFile.Close()
		fileLogger = nil
	})

	fileLogger.Log(context.Background(), slogLevel(LOG_LEVEL_FATAL), "cannot go on", AppLogSourceKey, "main.go:1")

	content, _ := os.ReadFile(path)
	var line map[string]any
	if err := json.Unmarshal(content, &line); err != nil {
		t.Fatalf("not JSON: %q", content)
	}
	if line["level"] != "FATAL" {
		t.Errorf("slog would print ERROR+4; the file says FATAL. Got %v", line["level"])
	}
}

func TestCappedFileStartsAnewAtItsCap(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	capped, err := newCappedFile(path, 100)
	if err != nil {
		t.Fatal(err)
	}
	defer capped.Close()

	for _, letter := range []string{"a", "b", "c"} {
		if _, err := capped.Write([]byte(strings.Repeat(letter, 59) + "\n")); err != nil {
			t.Fatal(err)
		}
	}

	current, _ := os.ReadFile(path)
	previous, _ := os.ReadFile(path + ".1")
	if string(current) != strings.Repeat("c", 59)+"\n" {
		t.Errorf("the new file holds the newest write, got %q", current)
	}
	if string(previous) != strings.Repeat("b", 59)+"\n" {
		t.Errorf("one file before it is kept, got %q", previous)
	}
}

func TestCappedFileCarriesOnAfterARestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	if err := os.WriteFile(path, []byte(strings.Repeat("x", 90)), 0644); err != nil {
		t.Fatal(err)
	}

	capped, err := newCappedFile(path, 100)
	if err != nil {
		t.Fatal(err)
	}
	defer capped.Close()
	if _, err := capped.Write([]byte(strings.Repeat("y", 20))); err != nil {
		t.Fatal(err)
	}

	current, _ := os.ReadFile(path)
	previous, _ := os.ReadFile(path + ".1")
	if string(current) != strings.Repeat("y", 20) || len(previous) != 90 {
		t.Errorf("a file already near its cap is moved aside by the write that would pass it: %d and %d bytes", len(current), len(previous))
	}
}
