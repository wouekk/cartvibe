package services

import (
	"errors"
	"strings"
	"testing"
	"time"

	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
)

func TestFormatEmailContent_BothPresent(t *testing.T) {
	result := FormatEmailContent("OCR extracted text", true, "Email body content")
	expected := "Image Data:\nOCR extracted text\n\nEmail Body:\nEmail body content"
	if result != expected {
		t.Errorf("Expected:\n%s\n\nGot:\n%s", expected, result)
	}
}

func TestFormatEmailContent_ImageDataOnly(t *testing.T) {
	result := FormatEmailContent("OCR extracted text", true, "")
	expected := "Image Data:\nOCR extracted text\n\nEmail Body:\nNo email body found"
	if result != expected {
		t.Errorf("Expected:\n%s\n\nGot:\n%s", expected, result)
	}
}

func TestFormatEmailContent_EmailBodyOnly(t *testing.T) {
	result := FormatEmailContent("", false, "Receipt from Amazon: $45.00")
	expected := "Image Data:\nNo attachments found\n\nEmail Body:\nReceipt from Amazon: $45.00"
	if result != expected {
		t.Errorf("Expected:\n%s\n\nGot:\n%s", expected, result)
	}
}

func TestFormatEmailContent_NeitherPresent(t *testing.T) {
	result := FormatEmailContent("", false, "")
	expected := "Image Data:\nNo attachments found\n\nEmail Body:\nNo email body found"
	if result != expected {
		t.Errorf("Expected:\n%s\n\nGot:\n%s", expected, result)
	}
}

func TestFormatEmailContent_HasImageButEmptyOcrText(t *testing.T) {
	// When hasImage is true but ocrText is empty (e.g., vision model path),
	// we should NOT show "No attachments found" since there IS an image.
	result := FormatEmailContent("", true, "Some body")
	expected := "Image Data:\n\n\nEmail Body:\nSome body"
	if result != expected {
		t.Errorf("Expected:\n%s\n\nGot:\n%s", expected, result)
	}
}

func TestCombineOcrResults_Empty(t *testing.T) {
	text, cmd, err := combineOcrResults(nil)
	if err != nil {
		t.Errorf("expected no error for empty input, got: %v", err)
	}
	if text != "" {
		t.Errorf("expected empty text, got: %q", text)
	}
	if cmd.Status != "" {
		t.Errorf("expected zero-value command, got status %q", cmd.Status)
	}
}

func TestCombineOcrResults_SingleSuccess(t *testing.T) {
	start := time.Now()
	end := start.Add(time.Second)
	in := []ocrImageResult{
		{
			Text: "receipt total $5",
			Command: commands.UpsertSystemTaskCommand{
				Status:            models.SYSTEM_TASK_SUCCEEDED,
				StartedAt:         start,
				EndedAt:           &end,
				ResultDescription: "receipt total $5",
			},
		},
	}

	text, cmd, err := combineOcrResults(in)

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if text != "receipt total $5" {
		t.Errorf("expected single-image text passthrough, got: %q", text)
	}
	if cmd.Status != models.SYSTEM_TASK_SUCCEEDED {
		t.Errorf("expected SUCCEEDED, got: %s", cmd.Status)
	}
	// Single-image success: ResultDescription gets overwritten with the
	// combined text, which equals the original text — idempotent.
	if cmd.ResultDescription != "receipt total $5" {
		t.Errorf("expected ResultDescription %q, got: %q", "receipt total $5", cmd.ResultDescription)
	}
}

func TestCombineOcrResults_SingleFailurePreservesErrorDescription(t *testing.T) {
	start := time.Now()
	end := start.Add(time.Millisecond)
	failErr := errors.New("ocr blew up")
	in := []ocrImageResult{
		{
			Text: "",
			Err:  failErr,
			Command: commands.UpsertSystemTaskCommand{
				Status:            models.SYSTEM_TASK_FAILED,
				StartedAt:         start,
				EndedAt:           &end,
				ResultDescription: "ocr blew up",
			},
		},
	}

	text, cmd, err := combineOcrResults(in)

	if !errors.Is(err, failErr) {
		t.Errorf("expected the original failure error, got: %v", err)
	}
	if text != "" {
		t.Errorf("expected empty combined text on sole failure, got: %q", text)
	}
	if cmd.Status != models.SYSTEM_TASK_FAILED {
		t.Errorf("expected FAILED status, got: %s", cmd.Status)
	}
	// When every image failed there's no combined text to write — the
	// error-message description from OcrService must survive.
	if cmd.ResultDescription != "ocr blew up" {
		t.Errorf("expected failure description preserved, got: %q", cmd.ResultDescription)
	}
}

func TestCombineOcrResults_MultiSuccessJoinsWithSeparator(t *testing.T) {
	start := time.Now()
	mid := start.Add(time.Second)
	end := start.Add(2 * time.Second)
	in := []ocrImageResult{
		{
			Text: "first image",
			Command: commands.UpsertSystemTaskCommand{
				Status:            models.SYSTEM_TASK_SUCCEEDED,
				StartedAt:         start,
				EndedAt:           &mid,
				ResultDescription: "first image",
			},
		},
		{
			Text: "second image",
			Command: commands.UpsertSystemTaskCommand{
				Status:            models.SYSTEM_TASK_SUCCEEDED,
				StartedAt:         mid,
				EndedAt:           &end,
				ResultDescription: "second image",
			},
		},
	}

	text, cmd, err := combineOcrResults(in)

	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	expectedText := "first image" + ocrImageSeparator + "second image"
	if text != expectedText {
		t.Errorf("expected text %q, got %q", expectedText, text)
	}
	if cmd.Status != models.SYSTEM_TASK_SUCCEEDED {
		t.Errorf("expected SUCCEEDED, got: %s", cmd.Status)
	}
	if cmd.StartedAt != start {
		t.Errorf("expected aggregated start to be the first start, got: %v", cmd.StartedAt)
	}
	if cmd.EndedAt == nil || *cmd.EndedAt != end {
		t.Errorf("expected aggregated end to be the last end (%v), got: %v", end, cmd.EndedAt)
	}
	if cmd.ResultDescription != expectedText {
		t.Errorf("multi-image run should overwrite ResultDescription with combined text, got: %q", cmd.ResultDescription)
	}
}

func TestCombineOcrResults_MultiSecondFails(t *testing.T) {
	start := time.Now()
	mid := start.Add(time.Second)
	end := start.Add(2 * time.Second)
	failErr := errors.New("second image failed")
	in := []ocrImageResult{
		{
			Text: "first ok",
			Command: commands.UpsertSystemTaskCommand{
				Status:            models.SYSTEM_TASK_SUCCEEDED,
				StartedAt:         start,
				EndedAt:           &mid,
				ResultDescription: "first ok",
			},
		},
		{
			Text: "",
			Err:  failErr,
			Command: commands.UpsertSystemTaskCommand{
				Status:    models.SYSTEM_TASK_FAILED,
				StartedAt: mid,
				EndedAt:   &end,
			},
		},
	}

	text, cmd, err := combineOcrResults(in)

	if !errors.Is(err, failErr) {
		t.Errorf("expected the second image's error, got: %v", err)
	}
	// Aggregated text should still contain the first image's content; failed images contribute nothing.
	if text != "first ok" {
		t.Errorf("expected only the successful image's text, got: %q", text)
	}
	if cmd.Status != models.SYSTEM_TASK_FAILED {
		t.Errorf("expected FAILED when any image fails, got: %s", cmd.Status)
	}
	if cmd.EndedAt == nil || *cmd.EndedAt != end {
		t.Errorf("expected aggregated end to be the failing image's end, got: %v", cmd.EndedAt)
	}
}

func TestEncodeImageForAi_UnsupportedAiTypeReturnsError(t *testing.T) {
	service := ReceiptProcessingService{}
	settings := models.ReceiptProcessingSettings{
		AiType: models.AiClientType("totally-bogus-provider"),
	}

	encoded, err := service.encodeImageForAi("/does/not/matter", settings)
	if err == nil {
		t.Fatal("expected error for unsupported AI type, got nil")
	}
	if encoded != "" {
		t.Errorf("expected empty encoded string on error, got: %q", encoded)
	}
	if !strings.Contains(err.Error(), "unsupported AI type") {
		t.Errorf("expected error to mention 'unsupported AI type', got: %v", err)
	}
}
