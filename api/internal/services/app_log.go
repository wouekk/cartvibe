package services

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"regexp"
	"strings"
	"time"

	"cartvibe/api/internal/logging"
)

// AppLogEntry is one message of the application log (Phase 3 M2). Level is a plain string on the
// API so a new level never breaks a released client.
type AppLogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

const (
	AppLogPath         = logging.AppLogPath
	appLogTailBytes    = 1 << 20
	AppLogDefaultLimit = 200
	AppLogMaxLimit     = 1000

	// How the viewer shows a moment: the shape the old text log printed, in the server's time zone.
	appLogTimeLayout = "2006/01/02 15:04:05"
)

// A line of the file is a JSON object written by log/slog (logging.InitLog): time, level, msg and source.
type appLogLine struct {
	Time   time.Time `json:"time"`
	Level  string    `json:"level"`
	Msg    string    `json:"msg"`
	Source string    `json:"source"`
}

// Until 2026-11 a line was text: "App2026/10/20 10:00:00 log.go:52: [x.go:10] ERROR:  message", and a line that
// did not start that way continued the message before it. A log file that outlived the update still holds such
// lines, so they are read as before.
var appLogLineRegex = regexp.MustCompile(`^App(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}) \S+: (.*)$`)
var appLogLevelRegex = regexp.MustCompile(`^\[[^\]]*\] (INFO|ERROR|FATAL): (.*)$`)

// ReadAppLog returns the newest entries of the log at path, newest first, at most limit of them, and
// only those of the given level when one is named. Only the last megabyte of a file is read, so a long-running
// install does not load a huge file. When the file does not hold enough (it starts anew at its size cap), the
// one before it ("<path>.1") gives the rest. A missing file is an empty log, not an error.
func ReadAppLog(path string, level string, limit int) ([]AppLogEntry, error) {
	entries := []AppLogEntry{}

	if limit <= 0 {
		limit = AppLogDefaultLimit
	}
	if limit > AppLogMaxLimit {
		limit = AppLogMaxLimit
	}
	level = strings.ToUpper(strings.TrimSpace(level))

	for _, file := range []string{path, path + ".1"} {
		parsed, err := readAppLogTail(file)
		if err != nil {
			return entries, err
		}
		for i := len(parsed) - 1; i >= 0 && len(entries) < limit; i-- {
			if level != "" && parsed[i].Level != level {
				continue
			}
			entries = append(entries, parsed[i])
		}
		if len(entries) >= limit {
			break
		}
	}

	return entries, nil
}

// readAppLogTail parses the last megabyte of one log file, oldest first. A missing file has no entries.
func readAppLogTail(path string) ([]AppLogEntry, error) {
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return nil, err
	}

	offset := int64(0)
	if info.Size() > appLogTailBytes {
		offset = info.Size() - appLogTailBytes
	}
	if _, err := file.Seek(offset, io.SeekStart); err != nil {
		return nil, err
	}

	content, err := io.ReadAll(file)
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.ReplaceAll(string(content), "\r\n", "\n"), "\n")
	if offset > 0 && len(lines) > 0 {
		// The first line is probably cut in half.
		lines = lines[1:]
	}

	parsed := []AppLogEntry{}
	for _, line := range lines {
		if line == "" {
			continue
		}

		if entry, ok := parseAppLogJson(line); ok {
			parsed = append(parsed, entry)
			continue
		}

		match := appLogLineRegex.FindStringSubmatch(line)
		if match == nil {
			if len(parsed) > 0 {
				parsed[len(parsed)-1].Message += "\n" + line
			}
			continue
		}

		entry := AppLogEntry{Timestamp: match[1], Message: match[2]}
		if levelMatch := appLogLevelRegex.FindStringSubmatch(match[2]); levelMatch != nil {
			entry.Level = levelMatch[1]
			entry.Message = strings.TrimSpace(levelMatch[2])
		}
		parsed = append(parsed, entry)
	}

	return parsed, nil
}

func parseAppLogJson(line string) (AppLogEntry, bool) {
	if !strings.HasPrefix(line, "{") {
		return AppLogEntry{}, false
	}

	var fields appLogLine
	if err := json.Unmarshal([]byte(line), &fields); err != nil || fields.Level == "" {
		return AppLogEntry{}, false
	}

	return AppLogEntry{
		Timestamp: fields.Time.Local().Format(appLogTimeLayout),
		Level:     fields.Level,
		Message:   strings.TrimSpace(fields.Msg),
	}, true
}
