package wranglerasynq

import (
	"github.com/hibiken/asynq"
	"os"
	"path/filepath"
	"testing"
)

func TestCleanupImages_SkipsEmptyPaths(t *testing.T) {
	// Body-only tasks produce entries with both paths empty.
	// Cleanup should skip these without error.
	attachmentMap := map[attachmentMapKey][]*asynq.TaskInfo{
		{OriginalFilePath: "", ImageForOcrPath: ""}: {
			{State: asynq.TaskStateCompleted},
		},
	}

	err := cleanupImages(attachmentMap)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}
}

func TestCleanupImages_RemovesCompletedFiles(t *testing.T) {
	// Create temporary files to simulate attachment processing
	tmpDir := t.TempDir()
	originalPath := filepath.Join(tmpDir, "original.jpg")
	ocrPath := filepath.Join(tmpDir, "image-original.jpg")

	err := os.WriteFile(originalPath, []byte("original"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	err = os.WriteFile(ocrPath, []byte("ocr"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	attachmentMap := map[attachmentMapKey][]*asynq.TaskInfo{
		{OriginalFilePath: originalPath, ImageForOcrPath: ocrPath}: {
			{State: asynq.TaskStateCompleted},
		},
	}

	err = cleanupImages(attachmentMap)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	// Verify files were deleted
	if _, err := os.Stat(originalPath); !os.IsNotExist(err) {
		t.Error("Expected original file to be deleted")
	}
	if _, err := os.Stat(ocrPath); !os.IsNotExist(err) {
		t.Error("Expected OCR file to be deleted")
	}
}

func TestCleanupImages_DoesNotRemoveActiveFiles(t *testing.T) {
	tmpDir := t.TempDir()
	originalPath := filepath.Join(tmpDir, "original.jpg")
	ocrPath := filepath.Join(tmpDir, "image-original.jpg")

	err := os.WriteFile(originalPath, []byte("original"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	err = os.WriteFile(ocrPath, []byte("ocr"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	attachmentMap := map[attachmentMapKey][]*asynq.TaskInfo{
		{OriginalFilePath: originalPath, ImageForOcrPath: ocrPath}: {
			{State: asynq.TaskStateActive},
		},
	}

	err = cleanupImages(attachmentMap)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	// Verify files still exist
	if _, err := os.Stat(originalPath); os.IsNotExist(err) {
		t.Error("Expected original file to still exist")
	}
	if _, err := os.Stat(ocrPath); os.IsNotExist(err) {
		t.Error("Expected OCR file to still exist")
	}
}

func TestCleanupImages_MixedEmptyAndRealPaths(t *testing.T) {
	tmpDir := t.TempDir()
	originalPath := filepath.Join(tmpDir, "original.jpg")
	ocrPath := filepath.Join(tmpDir, "image-original.jpg")

	err := os.WriteFile(originalPath, []byte("original"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	err = os.WriteFile(ocrPath, []byte("ocr"), 0644)
	if err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	attachmentMap := map[attachmentMapKey][]*asynq.TaskInfo{
		// Body-only task (empty paths)
		{OriginalFilePath: "", ImageForOcrPath: ""}: {
			{State: asynq.TaskStateCompleted},
		},
		// Attachment task (real paths, completed)
		{OriginalFilePath: originalPath, ImageForOcrPath: ocrPath}: {
			{State: asynq.TaskStateCompleted},
		},
	}

	err = cleanupImages(attachmentMap)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	// Verify real files were deleted
	if _, err := os.Stat(originalPath); !os.IsNotExist(err) {
		t.Error("Expected original file to be deleted")
	}
	if _, err := os.Stat(ocrPath); !os.IsNotExist(err) {
		t.Error("Expected OCR file to be deleted")
	}
}
