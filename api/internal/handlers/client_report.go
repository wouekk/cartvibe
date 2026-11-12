package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sync"
	"time"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/structs"
)

const (
	// clientReportBodyLimit caps what the app may send; a report is two short texts.
	clientReportBodyLimit = 16 << 10
	// clientReportDetailLimit is how much of the detail is kept, in bytes.
	clientReportDetailLimit = 500
	// clientReportRepeatWindow is how long the same report from the same person is logged only once.
	clientReportRepeatWindow = 10 * time.Minute
	// clientReportsPerHour bounds what one person can add to the log, whatever they send.
	clientReportsPerHour = 30
)

// clientReportKind is what a kind looks like: lower-case words joined by hyphens.
var clientReportKind = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+){0,7}$`)

var clientReportsSeen = struct {
	sync.Mutex
	at     map[string]time.Time
	counts map[uint][]time.Time
}{at: map[string]time.Time{}, counts: map[uint][]time.Time{}}

// ReportClientProblem writes to the log what the web app says went wrong in the browser. Some failures never
// reach the server (a phone that closed the page while its camera was open, a file the app left out), so without
// this nothing records them, and "it did not work" has no trace to start from. It needs sign-in and nothing else,
// stores nothing, and always answers 204: the app must never fail over a report. The text comes from a browser, so
// it is kept to one clipped line, the same report is logged once in ten minutes, and one person adds at most
// thirty lines an hour.
func ReportClientProblem(w http.ResponseWriter, r *http.Request) {
	defer w.WriteHeader(http.StatusNoContent)

	body, err := io.ReadAll(io.LimitReader(r.Body, clientReportBodyLimit))
	if err != nil || len(body) == 0 {
		return
	}
	var command commands.ClientReportCommand
	if json.Unmarshal(body, &command) != nil || !clientReportKind.MatchString(command.Kind) {
		return
	}

	token := structs.GetClaims(r)
	if token == nil {
		return
	}
	detail := command.Detail
	if len(detail) > clientReportDetailLimit {
		detail = detail[:clientReportDetailLimit] + "…"
	}
	if !firstClientReportInWindow(token.UserId, command.Kind+" "+detail, time.Now()) {
		return
	}

	logging.LogStd(logging.LOG_LEVEL_ERROR, fmt.Sprintf("app report from user %d: %s: %s (browser: %s)",
		token.UserId, command.Kind, clip(detail), clip(r.UserAgent())))
}

// firstClientReportInWindow says whether this report should be logged: not seen from this person in the window,
// and the person is under their hourly count.
func firstClientReportInWindow(userId uint, report string, now time.Time) bool {
	clientReportsSeen.Lock()
	defer clientReportsSeen.Unlock()

	key := fmt.Sprintf("%d %s", userId, report)
	if seen, ok := clientReportsSeen.at[key]; ok && now.Sub(seen) < clientReportRepeatWindow {
		return false
	}

	recent := clientReportsSeen.counts[userId][:0]
	for _, at := range clientReportsSeen.counts[userId] {
		if now.Sub(at) < time.Hour {
			recent = append(recent, at)
		}
	}
	if len(recent) >= clientReportsPerHour {
		clientReportsSeen.counts[userId] = recent
		return false
	}

	if len(clientReportsSeen.at) > 1000 {
		clientReportsSeen.at = map[string]time.Time{}
	}
	clientReportsSeen.at[key] = now
	clientReportsSeen.counts[userId] = append(recent, now)

	return true
}
