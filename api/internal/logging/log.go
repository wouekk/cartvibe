package logging

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// The log has two readers. A person reads the container's output (docker logs), which stays one line of text per
// message. The log viewer under System Settings reads logs/app.log, which is one JSON object per line (log/slog),
// so it reads fields instead of taking a line of text apart.
//
// The file is capped. At AppLogMaxBytes it becomes app.log.1, replacing the one before, and a new file starts, so
// the two together never pass twice the cap (it used to grow for as long as the install lived).
const (
	AppLogPath     = "logs/app.log"
	AppLogMaxBytes = 10 << 20

	// The keys of a line in the file; services.ReadAppLog reads them back.
	AppLogSourceKey = "source"
)

// slog has no FATAL of its own: one step above ERROR, printed by name.
const levelFatal = slog.LevelError + 4

var fileLogger *slog.Logger
var logFile *cappedFile
var stdLogger = log.New(os.Stdout, "App", log.Lshortfile|log.LstdFlags)

func InitLog() error {
	return initLogAt(AppLogPath, AppLogMaxBytes)
}

func initLogAt(path string, maxBytes int64) error {
	if err := os.MkdirAll(filepath.Dir(path), os.ModePerm); err != nil {
		log.Print(err.Error())
		return err
	}

	file, err := newCappedFile(path, maxBytes)
	if err != nil {
		return err
	}

	logFile = file
	fileLogger = slog.New(slog.NewJSONHandler(file, &slog.HandlerOptions{
		ReplaceAttr: func(groups []string, attr slog.Attr) slog.Attr {
			if attr.Key == slog.LevelKey && attr.Value.Any() == levelFatal {
				return slog.String(slog.LevelKey, string(LOG_LEVEL_FATAL))
			}
			return attr
		},
	}))

	return nil
}

func slogLevel(level LogLevel) slog.Level {
	switch level {
	case LOG_LEVEL_FATAL:
		return levelFatal
	case LOG_LEVEL_ERROR:
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// LogStd writes one message to the log file and to the container's output. A FATAL message ends the process.
func LogStd(level LogLevel, v ...any) {
	if level != LOG_LEVEL_FATAL && level != LOG_LEVEL_ERROR && level != LOG_LEVEL_INFO {
		return
	}

	_, file, line, _ := runtime.Caller(1)
	source := fmt.Sprintf("%s:%d", filepath.Base(file), line)

	if fileLogger != nil {
		message := strings.TrimSuffix(fmt.Sprintln(v...), "\n")
		fileLogger.Log(context.Background(), slogLevel(level), message, AppLogSourceKey, source)
	}
	stdLogger.Println(append([]any{"[" + source + "]", string(level) + ": "}, v...)...)

	if level == LOG_LEVEL_FATAL {
		os.Exit(1)
	}
}
