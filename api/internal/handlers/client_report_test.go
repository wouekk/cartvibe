package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
)

// clientReportLogLines returns the lines the log file gained since size, as their messages.
func clientReportLogLines(t *testing.T, size int64) []string {
	t.Helper()

	raw, err := os.ReadFile("logs/app.log")
	if err != nil {
		t.Fatalf("the log: %v", err)
	}
	lines := []string{}
	for _, line := range strings.Split(string(raw[size:]), "\n") {
		var entry struct {
			Message string `json:"msg"`
		}
		if json.Unmarshal([]byte(line), &entry) == nil && strings.HasPrefix(entry.Message, "app report") {
			lines = append(lines, entry.Message)
		}
	}
	return lines
}

func clientReportLogSize(t *testing.T) int64 {
	t.Helper()

	info, err := os.Stat("logs/app.log")
	if err != nil {
		return 0
	}
	return info.Size()
}

func sendClientReport(userId uint, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/clientReport", strings.NewReader(body))
	r.Header.Set("User-Agent", "Mozilla/5.0 (Linux; Android 14) Chrome/142")
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, claimsForUser(userId)))
	ReportClientProblem(w, r)
	return w
}

func resetClientReports() {
	clientReportsSeen.Lock()
	defer clientReportsSeen.Unlock()
	clientReportsSeen.at = map[string]time.Time{}
	clientReportsSeen.counts = map[uint][]time.Time{}
}

func TestAClientReportIsOneLineInTheLog(t *testing.T) {
	resetClientReports()
	size := clientReportLogSize(t)

	w := sendClientReport(7, `{"kind":"quick-scan-camera-closed","detail":"the page was closed 12 s after the camera opened"}`)
	if w.Result().StatusCode != http.StatusNoContent {
		t.Fatalf("status %d, want 204", w.Result().StatusCode)
	}

	lines := clientReportLogLines(t, size)
	want := "app report from user 7: quick-scan-camera-closed: the page was closed 12 s after the camera opened (browser: Mozilla/5.0 (Linux; Android 14) Chrome/142)"
	if len(lines) != 1 || lines[0] != want {
		t.Fatalf("the log gained %q, want %q", lines, want)
	}

	// The same report again within the window says nothing new; another person's, or another detail, does.
	sendClientReport(7, `{"kind":"quick-scan-camera-closed","detail":"the page was closed 12 s after the camera opened"}`)
	sendClientReport(8, `{"kind":"quick-scan-camera-closed","detail":"the page was closed 12 s after the camera opened"}`)
	sendClientReport(7, `{"kind":"quick-scan-file-left-out","detail":"notes.txt"}`)
	if lines := clientReportLogLines(t, size); len(lines) != 3 {
		t.Errorf("three different reports, three lines: %q", lines)
	}
}

// What a browser sends is not ours: a report is clipped to one line, and anything that is not a report is
// dropped, each with the same 204 (the app must never fail over a report).
func TestAClientReportIsClippedAndWhatIsNotOneIsDropped(t *testing.T) {
	resetClientReports()
	size := clientReportLogSize(t)

	for name, body := range map[string]string{
		"not JSON":             `{`,
		"empty":                ``,
		"no kind":              `{"detail":"x"}`,
		"a kind with spaces":   `{"kind":"quick scan","detail":"x"}`,
		"a kind in capitals":   `{"kind":"QUICK-SCAN","detail":"x"}`,
		"a kind with a line":   "{\"kind\":\"scan\\nINFO forged\",\"detail\":\"x\"}",
		"a kind of nine words": `{"kind":"a-b-c-d-e-f-g-h-i","detail":"x"}`,
	} {
		if w := sendClientReport(7, body); w.Result().StatusCode != http.StatusNoContent {
			t.Errorf("%s: status %d, want 204", name, w.Result().StatusCode)
		}
	}
	if lines := clientReportLogLines(t, size); len(lines) != 0 {
		t.Fatalf("nothing of that is a report: %q", lines)
	}

	long, _ := json.Marshal(map[string]string{"kind": "upload-failed", "detail": "first line\nsecond line " + strings.Repeat("x", 2000)})
	sendClientReport(7, string(long))
	lines := clientReportLogLines(t, size)
	if len(lines) != 1 {
		t.Fatalf("one line for the long report: %q", lines)
	}
	if strings.Contains(lines[0], "\n") || !strings.Contains(lines[0], "first line second line") || len(lines[0]) > 600 {
		t.Errorf("the detail is one clipped line: %d bytes, %q", len(lines[0]), lines[0][:120])
	}
}

func TestOnePersonAddsAtMostThirtyLinesAnHour(t *testing.T) {
	resetClientReports()
	size := clientReportLogSize(t)

	for i := 0; i < 40; i++ {
		detail, _ := json.Marshal(map[string]any{"kind": "upload-failed", "detail": strings.Repeat("y", i+1)})
		sendClientReport(9, string(detail))
	}

	if lines := clientReportLogLines(t, size); len(lines) != clientReportsPerHour {
		t.Errorf("%d lines, want %d", len(lines), clientReportsPerHour)
	}

	// An hour later the person may report again.
	if !firstClientReportInWindow(9, "upload-failed later", time.Now().Add(61*time.Minute)) {
		t.Error("the count starts again after an hour")
	}
}
