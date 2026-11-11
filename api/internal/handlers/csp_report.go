package handlers

import (
	"cartvibe/api/internal/logging"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// cspReportBodyLimit caps what a browser may send; a real report is well under 2 KB.
const cspReportBodyLimit = 16 << 10

// cspReportRepeatWindow is how long the same violation (directive and blocked address) is logged only once, so a page
// that breaks the policy on every load does not fill the log.
const cspReportRepeatWindow = time.Hour

type cspViolation struct {
	DocumentUri        string `json:"document-uri"`
	BlockedUri         string `json:"blocked-uri"`
	ViolatedDirective  string `json:"violated-directive"`
	EffectiveDirective string `json:"effective-directive"`
	SourceFile         string `json:"source-file"`
	LineNumber         int    `json:"line-number"`
}

var cspReportsSeen = struct {
	sync.Mutex
	at map[string]time.Time
}{at: map[string]time.Time{}}

// CspReport receives the browser's Content-Security-Policy violation reports (the policy's report-uri) and writes
// each new one to the log, which is what decides when the policy can move from Report-Only to enforced. It needs no
// sign-in (the browser sends it on its own), stores nothing and always answers 204; the edge limits how often it is
// called and how large a body may be.
func CspReport(w http.ResponseWriter, r *http.Request) {
	defer w.WriteHeader(http.StatusNoContent)

	body, err := io.ReadAll(io.LimitReader(r.Body, cspReportBodyLimit))
	if err != nil || len(body) == 0 {
		return
	}
	var envelope struct {
		Report cspViolation `json:"csp-report"`
	}
	if json.Unmarshal(body, &envelope) != nil {
		return
	}
	violation := envelope.Report
	directive := violation.EffectiveDirective
	if directive == "" {
		directive = violation.ViolatedDirective
	}
	if directive == "" && violation.BlockedUri == "" {
		return
	}
	if !firstCspReportInWindow(directive+" "+violation.BlockedUri, time.Now()) {
		return
	}

	where := violation.SourceFile
	if violation.LineNumber > 0 {
		where = fmt.Sprintf("%s:%d", where, violation.LineNumber)
	}
	logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("CSP report: %s blocked %q on %s (from %s)",
		clip(directive), clip(violation.BlockedUri), clip(violation.DocumentUri), clip(where)))
}

func firstCspReportInWindow(key string, now time.Time) bool {
	cspReportsSeen.Lock()
	defer cspReportsSeen.Unlock()
	if seen, ok := cspReportsSeen.at[key]; ok && now.Sub(seen) < cspReportRepeatWindow {
		return false
	}
	if len(cspReportsSeen.at) > 1000 {
		cspReportsSeen.at = map[string]time.Time{}
	}
	cspReportsSeen.at[key] = now
	return true
}

// clip keeps a reported value to one short line: the values come from the browser, not from us.
func clip(value string) string {
	value = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return ' '
		}
		return r
	}, value)
	if len(value) > 200 {
		return value[:200] + "…"
	}
	return value
}
