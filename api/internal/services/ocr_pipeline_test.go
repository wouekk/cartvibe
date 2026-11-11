package services

import (
	"bytes"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cartvibe/api/internal/imagetool/imagetooltest"
)

// The path a photo takes to a text-only AI model: prepared by ImageMagick, read by Tesseract. Until the two ran as
// programs this needed the cgo bindings, so nothing tested it.
func TestOcrPipeline_APreparedPictureIsStillReadable(t *testing.T) {
	imagetooltest.RequireMagick(t)
	imagetooltest.RequireTesseract(t)

	path := filepath.Join(t.TempDir(), "receipt.png")
	if err := os.WriteFile(path, imagetooltest.TextPicture(t, "RECEIPT 42"), 0o600); err != nil {
		t.Fatal(err)
	}
	service := OcrService{}

	prepared, err := service.prepareImage(path)
	if err != nil {
		t.Fatalf("prepareImage: %v", err)
	}
	picture, err := png.Decode(bytes.NewReader(prepared))
	if err != nil {
		t.Fatalf("the prepared picture is not a PNG: %v", err)
	}
	// Trimmed to the words: the white around them is gone.
	if size := picture.Bounds().Size(); size.X >= 750 || size.Y >= 200 {
		t.Fatalf("the picture was not trimmed to its text: %v", size)
	}

	// Read with the five languages and the blacklist, as a receipt is.
	text, err := service.ReadImageWithTesseract(prepared)
	if err != nil {
		t.Fatalf("ReadImageWithTesseract: %v", err)
	}
	if !strings.Contains(text, "RECEIPT") || !strings.Contains(text, "42") {
		t.Fatalf("the words were lost on the way: %q", text)
	}
}

// A folder name is a person's to choose, and ImageMagick reads "[0]", "*" or "%d" in a file name as instructions.
// The picture must be read as the file it is, whatever its path spells.
func TestOcrPipeline_APathIsNeverReadAsAnInstruction(t *testing.T) {
	imagetooltest.RequireMagick(t)

	dir := filepath.Join(t.TempDir(), "3-Home [1] %d")
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "7-1-receipt[2].png")
	if err := os.WriteFile(path, imagetooltest.TextPicture(t, "RECEIPT 42"), 0o600); err != nil {
		t.Fatal(err)
	}

	prepared, err := OcrService{}.prepareImage(path)
	if err != nil {
		t.Fatalf("a picture in a folder with brackets in its name was not read: %v", err)
	}
	if _, err := png.Decode(bytes.NewReader(prepared)); err != nil {
		t.Fatalf("the prepared picture is not a PNG: %v", err)
	}
}

func TestOcrPipeline_AMissingFileIsAnError(t *testing.T) {
	if _, err := (OcrService{}).prepareImage(filepath.Join(t.TempDir(), "gone.jpg")); err == nil {
		t.Fatal("a file that is not there was prepared")
	}
}
