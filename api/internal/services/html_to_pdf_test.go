package services

import (
	"bytes"
	"strings"
	"testing"
)

func TestHtmlToPdfService_Render_BasicHtml(t *testing.T) {
	service := NewHtmlToPdfService(nil)

	html := `<!DOCTYPE html>
<html>
<head><title>Test Receipt</title></head>
<body>
  <h1>Receipt #1234</h1>
  <p>Total: $12.34</p>
</body>
</html>`

	pdfBytes, taskCmd, err := service.Render(html)
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	if len(pdfBytes) == 0 {
		t.Fatal("expected non-empty PDF bytes, got empty slice")
	}

	if !bytes.HasPrefix(pdfBytes, []byte("%PDF-")) {
		t.Fatalf("expected PDF bytes to start with %%PDF-, got: %q", string(pdfBytes[:min(20, len(pdfBytes))]))
	}

	if taskCmd.Status != "SUCCEEDED" {
		t.Errorf("expected system task status SUCCEEDED, got %s", taskCmd.Status)
	}

	if taskCmd.Type != "HTML_TO_PDF" {
		t.Errorf("expected system task type HTML_TO_PDF, got %s", taskCmd.Type)
	}

	if taskCmd.EndedAt == nil {
		t.Error("expected EndedAt to be set on success")
	}
}

func TestHtmlToPdfService_Render_EmptyHtmlFails(t *testing.T) {
	service := NewHtmlToPdfService(nil)

	pdfBytes, taskCmd, err := service.Render("")
	if err == nil {
		t.Fatal("expected error for empty HTML, got nil")
	}

	if pdfBytes != nil {
		t.Errorf("expected nil PDF bytes on error, got %d bytes", len(pdfBytes))
	}

	if taskCmd.Status != "FAILED" {
		t.Errorf("expected system task status FAILED, got %s", taskCmd.Status)
	}

	if !strings.Contains(taskCmd.ResultDescription, "empty") {
		t.Errorf("expected ResultDescription to mention empty, got %q", taskCmd.ResultDescription)
	}
}
