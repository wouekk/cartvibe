package services

import (
	"errors"
	"io"
	"os"
	"regexp"
	"strings"
)

// AppLogEntry is one line group of the application log (Phase 3 M2). Level is a plain string on the
// API so a new level never breaks a released client.
type AppLogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

const (
	AppLogPath         = "logs/app.log"
	appLogTailBytes    = 1 << 20
	AppLogDefaultLimit = 200
	AppLogMaxLimit     = 1000
)

// A line looks like "App2026/10/20 10:00:00 log.go:52: [x.go:10] ERROR:  message" (see
// logging.InitLog). Lines that do not start that way continue the previous message.
var appLogLineRegex = regexp.MustCompile(`^App(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}) \S+: (.*)$`)
var appLogLevelRegex = regexp.MustCompile(`^\[[^\]]*\] (INFO|ERROR|FATAL): (.*)$`)

// ReadAppLog returns the newest entries of the log at path, newest first, at most limit of them, and
// only those of the given level when one is named. Only the last megabyte is read, so a long-running
// install does not load a huge file. A missing file is an empty log, not an error.
func ReadAppLog(path string, level string, limit int) ([]AppLogEntry, error) {
	entries := []AppLogEntry{}

	if limit <= 0 {
		limit = AppLogDefaultLimit
	}
	if limit > AppLogMaxLimit {
		limit = AppLogMaxLimit
	}

	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return entries, nil
		}
		return entries, err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return entries, err
	}

	offset := int64(0)
	if info.Size() > appLogTailBytes {
		offset = info.Size() - appLogTailBytes
	}
	if _, err := file.Seek(offset, io.SeekStart); err != nil {
		return entries, err
	}

	content, err := io.ReadAll(file)
	if err != nil {
		return entries, err
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

	level = strings.ToUpper(strings.TrimSpace(level))
	for i := len(parsed) - 1; i >= 0 && len(entries) < limit; i-- {
		if level != "" && parsed[i].Level != level {
			continue
		}
		entries = append(entries, parsed[i])
	}

	return entries, nil
}
