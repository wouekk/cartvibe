// Package imagetool runs the two programs the API reads receipts with: ImageMagick's `magick` (convert a photo, a
// HEIC or a PDF) and `tesseract` (read the text of an image). Until 2026-11 both were linked into the API through
// cgo; as programs they need no C toolchain to build the server, a decoder that crashes takes down a child process
// instead of the API, and the same binary runs on every platform Go compiles for.
//
// Rules this package keeps, so its callers do not have to:
//   - The programs only ever see file names made here, in a directory made for the one call. ImageMagick reads
//     meaning into a name ("[0]" picks a frame, "*" matches files, "@" reads a list, a "fmt:" prefix picks a
//     decoder), and a household's folder name is chosen by a person, so a stored path is never handed over: the
//     bytes are.
//   - Files, not pipes: the image's ImageMagick policy refuses "-" (docker/imagemagick/policy.xml).
//   - Every run is bounded in time, and ends sooner when the context it was given ends.
//   - Nothing goes through a shell.
package imagetool

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ErrNotInstalled is returned (wrapped, naming the program) when `magick` or `tesseract` is not on the PATH. The
// image installs both and docker/checks/runtime-check.sh proves it; a development machine may have neither.
var ErrNotInstalled = errors.New("is not installed")

const (
	magickProgram    = "magick"
	tesseractProgram = "tesseract"

	// The policy file stops a conversion after 120 s of its own; this is the backstop for a process that hangs.
	magickTimeout = 3 * time.Minute
	// Five languages over a 3000 px photo take tens of seconds on a NAS processor.
	tesseractTimeout = 5 * time.Minute

	// How much of a program's error output is kept in the error handed back.
	errorOutputLimit = 600
)

// Conversion describes one `magick` run: settings that must come before the input is read, which frames of it
// to read, the operations in order, and the format to write.
type Conversion struct {
	// ReadSettings go before the input, for what only applies while decoding ("-density", "300").
	ReadSettings []string
	// AllFrames reads every frame or page; otherwise only the first is read (a multi-page PDF, an animated GIF, a
	// HEIC with a depth map).
	AllFrames bool
	// Operations are applied in order to what was read.
	Operations []string
	// Format is the coder the output is written with: "jpeg", "png", "pdf".
	Format string
}

// Convert runs one conversion over the given bytes and returns what `magick` wrote.
func Convert(ctx context.Context, input []byte, conversion Conversion) ([]byte, error) {
	if len(input) == 0 {
		return nil, errors.New("imagetool: nothing to convert")
	}
	if conversion.Format == "" {
		return nil, errors.New("imagetool: no output format")
	}

	dir, err := workDir()
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)

	in := filepath.Join(dir, "in")
	out := filepath.Join(dir, "out")
	if err := os.WriteFile(in, input, 0o600); err != nil {
		return nil, err
	}

	source := in
	if !conversion.AllFrames {
		source += "[0]"
	}
	args := append([]string{}, conversion.ReadSettings...)
	args = append(args, source)
	args = append(args, conversion.Operations...)
	args = append(args, conversion.Format+":"+out)

	if _, err := run(ctx, magickTimeout, magickProgram, args...); err != nil {
		return nil, err
	}

	result, err := os.ReadFile(out)
	if err != nil {
		return nil, fmt.Errorf("%s wrote no output: %w", magickProgram, err)
	}
	if len(result) == 0 {
		return nil, fmt.Errorf("%s wrote an empty file", magickProgram)
	}
	return result, nil
}

// ShrinkToFit is the pair of operations that makes an image's long edge at most maxSide pixels, never larger than
// it is, with the Lanczos filter the cgo code asked for.
func ShrinkToFit(maxSide uint) []string {
	side := strconv.FormatUint(uint64(maxSide), 10)
	return []string{"-filter", "Lanczos", "-resize", side + "x" + side + ">"}
}

// ReadText has Tesseract read an image (JPEG, PNG, TIFF, WebP or GIF bytes) in the given languages and returns the
// text without the line breaks around it. variables are Tesseract's own settings, such as tessedit_char_blacklist.
func ReadText(ctx context.Context, image []byte, languages []string, variables map[string]string) (string, error) {
	if len(image) == 0 {
		return "", errors.New("imagetool: nothing to read")
	}

	dir, err := workDir()
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)

	in := filepath.Join(dir, "in")
	if err := os.WriteFile(in, image, 0o600); err != nil {
		return "", err
	}

	// "stdout" is Tesseract's own name for writing the text to its output; no file is read back.
	args := []string{in, "stdout"}
	if len(languages) > 0 {
		args = append(args, "-l", strings.Join(languages, "+"))
	}
	// Page segmentation 6 (one block of text) is what the library used when nothing was set, and what every receipt
	// has been read with so far; the program's own default is 3 (automatic), which reads columns differently.
	args = append(args, "--psm", "6")
	// The program ends each page with a form feed; the library did not.
	args = append(args, "-c", "page_separator=")
	for name, value := range variables {
		args = append(args, "-c", name+"="+value)
	}

	text, err := run(ctx, tesseractTimeout, tesseractProgram, args...)
	if err != nil {
		return "", err
	}
	return strings.Trim(string(text), "\n"), nil
}

// Installed reports whether each program can be started, for a line in the log at start.
func Installed() (magick bool, tesseract bool) {
	_, magickErr := exec.LookPath(magickProgram)
	_, tesseractErr := exec.LookPath(tesseractProgram)
	return magickErr == nil, tesseractErr == nil
}

// workDir makes the directory one call works in. It is under the system's temporary directory, not the API's
// temp/ folder: nothing here outlives the call, and temp/ is swept by age.
func workDir() (string, error) {
	dir, err := os.MkdirTemp("", "cartvibe-image-")
	if err != nil {
		return "", fmt.Errorf("imagetool: no working directory: %w", err)
	}
	return dir, nil
}

// run starts a program and returns its standard output. An error names the program and carries the end of what it
// wrote to its error output, which is where ImageMagick and Tesseract say what was wrong with a file.
func run(ctx context.Context, timeout time.Duration, program string, args ...string) ([]byte, error) {
	path, err := exec.LookPath(program)
	if err != nil {
		return nil, fmt.Errorf("%s %w", program, ErrNotInstalled)
	}

	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var stdout, stderr bytes.Buffer
	command := exec.CommandContext(ctx, path, args...)
	command.Stdout = &stdout
	command.Stderr = &stderr
	// Once the context ends the process is killed; this bounds the wait for its pipes to close after that.
	command.WaitDelay = 5 * time.Second

	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("%s was stopped: %w", program, ctx.Err())
		}
		return nil, fmt.Errorf("%s failed: %w: %s", program, err, tail(stderr.String()))
	}
	return stdout.Bytes(), nil
}

func tail(output string) string {
	output = strings.TrimSpace(output)
	if len(output) > errorOutputLimit {
		return "…" + output[len(output)-errorOutputLimit:]
	}
	return output
}
