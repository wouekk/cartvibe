// Package imagetooltest lets a test say which program it needs. It is imported by tests only, so none of it is
// compiled into the server.
package imagetooltest

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
)

// RequireMagick skips a test on a machine without ImageMagick's `magick` (a development PC), and fails it in CI,
// where the program must be there: a skipped image test in CI would prove nothing.
func RequireMagick(t testing.TB) {
	t.Helper()
	require(t, "magick")
}

// RequireTesseract does the same for `tesseract`.
func RequireTesseract(t testing.TB) {
	t.Helper()
	require(t, "tesseract")
}

// TextPicture draws words in black Helvetica on white, 72 points tall, and returns the picture as a PNG: something
// for an OCR test to read that needs no fixture file. Ghostscript draws it with its own fonts (the way
// docker/checks/runtime-check.sh makes its test page), so the test is skipped where `gs` is missing and required
// in CI. Only letters, digits and spaces are taken: the words go into a PostScript string.
func TextPicture(t testing.TB, words string) []byte {
	t.Helper()
	require(t, "gs")

	for _, letter := range words {
		isLetter := (letter >= 'a' && letter <= 'z') || (letter >= 'A' && letter <= 'Z')
		if !isLetter && !(letter >= '0' && letter <= '9') && letter != ' ' {
			t.Fatalf("TextPicture takes letters, digits and spaces only, not %q", letter)
		}
	}

	out := filepath.Join(t.TempDir(), "words.png")
	width := 60 + 48*len(words)
	command := exec.Command("gs", "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
		"-sDEVICE=png16m", "-r100",
		"-dDEVICEWIDTHPOINTS="+strconv.Itoa(width), "-dDEVICEHEIGHTPOINTS=150",
		"-o", out,
		"-c", "/Helvetica findfont 72 scalefont setfont 30 45 moveto ("+words+") show showpage")
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("Ghostscript could not draw the words: %v: %s", err, output)
	}

	picture, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("Ghostscript wrote no picture: %v", err)
	}
	return picture
}

func require(t testing.TB, program string) {
	t.Helper()
	if _, err := exec.LookPath(program); err == nil {
		return
	}
	// GitHub Actions sets CI in every job, a container job included.
	if os.Getenv("CI") != "" {
		t.Fatalf("%s is not installed, and CI must run this test", program)
	}
	t.Skipf("%s is not installed on this machine; CI runs this test", program)
}
