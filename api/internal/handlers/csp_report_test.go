package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCspReportAlwaysAnswers204(t *testing.T) {
	bodies := []string{
		`{"csp-report":{"document-uri":"https://nas/","violated-directive":"script-src","blocked-uri":"inline"}}`,
		`not json`,
		``,
		strings.Repeat("x", cspReportBodyLimit*2),
	}
	for _, body := range bodies {
		recorder := httptest.NewRecorder()
		CspReport(recorder, httptest.NewRequest(http.MethodPost, "/api/cspReport", strings.NewReader(body)))
		if recorder.Code != http.StatusNoContent {
			t.Errorf("expected 204, got %d for %.20q", recorder.Code, body)
		}
	}
}

func TestCspReportLogsTheSameViolationOnceAnHour(t *testing.T) {
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	key := "img-src https://tracker.example/pixel.gif"
	if !firstCspReportInWindow(key, now) {
		t.Fatal("the first report must be logged")
	}
	if firstCspReportInWindow(key, now.Add(10*time.Minute)) {
		t.Fatal("a repeat within the hour must not be logged")
	}
	if !firstCspReportInWindow(key, now.Add(cspReportRepeatWindow+time.Minute)) {
		t.Fatal("a repeat after the hour must be logged again")
	}
}

func TestClipKeepsReportedValuesOnOneShortLine(t *testing.T) {
	if got := clip("a\nb\x00c"); got != "a b c" {
		t.Errorf("expected control characters replaced, got %q", got)
	}
	if got := clip(strings.Repeat("y", 500)); len(got) > 210 {
		t.Errorf("expected a long value clipped, got %d bytes", len(got))
	}
}
