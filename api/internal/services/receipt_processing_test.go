package services

import (
	"testing"
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
