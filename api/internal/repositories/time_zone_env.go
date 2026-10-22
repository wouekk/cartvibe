package repositories

import (
	"os"
	"strings"
	"time"
)

// envTimeZone is the zone the container is configured with (the TZ variable in the compose file) when
// it names a real zone other than UTC; "" otherwise.
func envTimeZone() string {
	name := strings.TrimSpace(os.Getenv("TZ"))
	if name == "" || strings.EqualFold(name, "UTC") || strings.EqualFold(name, "Local") {
		return ""
	}
	if _, err := time.LoadLocation(name); err != nil {
		return ""
	}

	return name
}
