package imagetool

import (
	"bytes"
	"cartvibe/api/internal/imagetool/imagetooltest"
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
	"time"
)

// A plain picture made in Go, so the tests need no fixture file: white, with a black bar across the middle.
func testPng(t *testing.T, width, height int) []byte {
	t.Helper()
	picture := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			shade := color.RGBA{255, 255, 255, 255}
			if y > height/3 && y < 2*height/3 {
				shade = color.RGBA{0, 0, 0, 255}
			}
			picture.Set(x, y, shade)
		}
	}
	var out bytes.Buffer
	if err := png.Encode(&out, picture); err != nil {
		t.Fatalf("could not make the test picture: %v", err)
	}
	return out.Bytes()
}

func TestConvert_WritesTheAskedFormat(t *testing.T) {
	imagetooltest.RequireMagick(t)

	result, err := Convert(context.Background(), testPng(t, 60, 40), Conversion{Operations: []string{"-quality", "90"}, Format: "jpeg"})
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}

	picture, err := jpeg.Decode(bytes.NewReader(result))
	if err != nil {
		t.Fatalf("the result is not a JPEG: %v", err)
	}
	if size := picture.Bounds().Size(); size.X != 60 || size.Y != 40 {
		t.Fatalf("the size changed: %v", size)
	}
}

func TestShrinkToFit_ShrinksTheLongEdgeAndNeverEnlarges(t *testing.T) {
	imagetooltest.RequireMagick(t)

	sizeAfter := func(width, height int, maxSide uint) image.Point {
		t.Helper()
		result, err := Convert(context.Background(), testPng(t, width, height), Conversion{Operations: ShrinkToFit(maxSide), Format: "png"})
		if err != nil {
			t.Fatalf("Convert: %v", err)
		}
		picture, err := png.Decode(bytes.NewReader(result))
		if err != nil {
			t.Fatalf("the result is not a PNG: %v", err)
		}
		return picture.Bounds().Size()
	}

	if size := sizeAfter(400, 100, 200); size.X != 200 || size.Y != 50 {
		t.Fatalf("400x100 into 200: got %v, want 200x50", size)
	}
	if size := sizeAfter(100, 400, 200); size.X != 50 || size.Y != 200 {
		t.Fatalf("100x400 into 200: got %v, want 50x200", size)
	}
	if size := sizeAfter(120, 80, 200); size.X != 120 || size.Y != 80 {
		t.Fatalf("a picture already small enough must stay as it is: got %v", size)
	}
}

func TestConvert_ReadsOnlyTheFirstPageUnlessAskedForAll(t *testing.T) {
	imagetooltest.RequireMagick(t)

	// Two pages of different heights in one PDF.
	page := testPng(t, 50, 30)
	twoPages, err := Convert(context.Background(), page, Conversion{Operations: []string{"(", "+clone", "-resize", "50x60!", ")"}, Format: "pdf"})
	if err != nil {
		t.Fatalf("could not make a two-page PDF: %v", err)
	}

	height := func(conversion Conversion) int {
		t.Helper()
		result, err := Convert(context.Background(), twoPages, conversion)
		if err != nil {
			t.Fatalf("Convert: %v", err)
		}
		picture, err := png.Decode(bytes.NewReader(result))
		if err != nil {
			t.Fatalf("the result is not a PNG: %v", err)
		}
		return picture.Bounds().Dy()
	}

	first := height(Conversion{Format: "png"})
	all := height(Conversion{AllFrames: true, Operations: []string{"-append"}, Format: "png"})
	if all <= first*2 {
		t.Fatalf("both pages stacked should be about three times the first page: first %d, all %d", first, all)
	}
}

func TestConvert_RefusesWhatIsNotAnImage(t *testing.T) {
	imagetooltest.RequireMagick(t)

	_, err := Convert(context.Background(), []byte("this is a text file, not a picture"), Conversion{Format: "jpeg"})
	if err == nil {
		t.Fatal("text was converted to a JPEG")
	}
	if !strings.Contains(err.Error(), "magick failed") {
		t.Fatalf("the error should name the program: %v", err)
	}
}

func TestConvert_NeedsInputAndAFormat(t *testing.T) {
	if _, err := Convert(context.Background(), nil, Conversion{Format: "jpeg"}); err == nil {
		t.Fatal("no input was accepted")
	}
	if _, err := Convert(context.Background(), []byte("x"), Conversion{}); err == nil {
		t.Fatal("no output format was accepted")
	}
	if _, err := ReadText(context.Background(), nil, nil, nil); err == nil {
		t.Fatal("no image was accepted")
	}
}

func TestReadText_ReadsTheWordsInAPicture(t *testing.T) {
	imagetooltest.RequireTesseract(t)

	text, err := ReadText(context.Background(), imagetooltest.TextPicture(t, "RECEIPT 42"), []string{"eng"}, nil)
	if err != nil {
		t.Fatalf("ReadText: %v", err)
	}
	if !strings.Contains(text, "RECEIPT") || !strings.Contains(text, "42") {
		t.Fatalf("the words were not read: %q", text)
	}
	// The text comes back as the library gave it: no line break around it, no form feed after the page.
	if strings.ContainsRune(text, '\f') || strings.HasPrefix(text, "\n") || strings.HasSuffix(text, "\n") {
		t.Fatalf("the text carries the program's page framing: %q", text)
	}
}

func TestReadText_PassesTesseractsSettingsOn(t *testing.T) {
	imagetooltest.RequireTesseract(t)

	text, err := ReadText(context.Background(), imagetooltest.TextPicture(t, "RECEIPT 42"), []string{"eng"}, map[string]string{
		"tessedit_char_blacklist": "4",
	})
	if err != nil {
		t.Fatalf("ReadText: %v", err)
	}
	if !strings.Contains(text, "RECEIPT") {
		t.Fatalf("the words were not read: %q", text)
	}
	if strings.Contains(text, "4") {
		t.Fatalf("a character Tesseract was told not to write came back: %q", text)
	}
}

func TestReadText_RefusesWhatIsNotAnImage(t *testing.T) {
	imagetooltest.RequireTesseract(t)

	_, err := ReadText(context.Background(), []byte("this is a text file, not a picture"), []string{"eng"}, nil)
	if err == nil {
		t.Fatal("text was read as a picture")
	}
	if !strings.Contains(err.Error(), "tesseract failed") {
		t.Fatalf("the error should name the program: %v", err)
	}
}

func TestRun_EndsWithItsContext(t *testing.T) {
	imagetooltest.RequireMagick(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := Convert(ctx, testPng(t, 20, 20), Conversion{Format: "jpeg"})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("a cancelled request should stop the conversion: %v", err)
	}
}

func TestRun_SaysWhichProgramIsMissing(t *testing.T) {
	_, err := run(context.Background(), time.Second, "cartvibe-no-such-program")
	if !errors.Is(err, ErrNotInstalled) {
		t.Fatalf("got %v, want ErrNotInstalled", err)
	}
	if !strings.Contains(err.Error(), "cartvibe-no-such-program") {
		t.Fatalf("the error should name the program: %v", err)
	}
}

func TestTail_KeepsTheEndOfLongOutput(t *testing.T) {
	long := strings.Repeat("a", errorOutputLimit) + "the end"
	kept := tail(long)
	if !strings.HasSuffix(kept, "the end") || !strings.HasPrefix(kept, "…") {
		t.Fatalf("the end of the output was not kept: %q", kept[len(kept)-20:])
	}
	if tail("  short \n") != "short" {
		t.Fatal("short output should be kept whole, trimmed")
	}
}
