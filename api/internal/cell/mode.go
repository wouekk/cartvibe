package cell

import (
	"fmt"
	"strings"
)

// Mode is how this process runs, chosen by the CARTVIBE_MODE environment variable.
type Mode string

const (
	// ModeStandalone is today's single-household server: one implicit cell, the database the process
	// opens at boot, no catalog and no gateway. It is the default and the only mode that runs.
	ModeStandalone Mode = "standalone"
	// ModeWorker is reserved for the hosted plan (many cells behind a catalog). Not implemented.
	ModeWorker Mode = "worker"
	// ModeImgproc is reserved for the sandboxed image-processing entrypoint. Not implemented.
	ModeImgproc Mode = "imgproc"
)

// ParseMode maps the raw CARTVIBE_MODE value to a Mode. An empty value is standalone, so an install that
// never set it behaves exactly as before. Anything unknown is an error: a typo must stop the boot, not
// silently pick a mode.
func ParseMode(raw string) (Mode, error) {
	switch Mode(strings.ToLower(strings.TrimSpace(raw))) {
	case "", ModeStandalone:
		return ModeStandalone, nil
	case ModeWorker:
		return ModeWorker, nil
	case ModeImgproc:
		return ModeImgproc, nil
	default:
		return "", fmt.Errorf("unknown CARTVIBE_MODE %q (standalone is the default; worker and imgproc are reserved)", raw)
	}
}

// Implemented reports whether the binary can run in this mode. worker and imgproc are reserved names:
// they parse, but the server refuses to start in them rather than quietly running as standalone.
func (m Mode) Implemented() bool {
	return m == ModeStandalone
}
