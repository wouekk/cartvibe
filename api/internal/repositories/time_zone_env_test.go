package repositories

import (
	"testing"
)

func TestEnvTimeZoneIgnoresUtcAndUnknownZones(t *testing.T) {
	for value, expected := range map[string]string{
		"":                  "",
		"UTC":               "",
		"Local":             "",
		"Not/AZone":         "",
		"Europe/Berlin":     "Europe/Berlin",
		" America/New_York": "America/New_York",
	} {
		t.Setenv("TZ", value)
		if got := envTimeZone(); got != expected {
			t.Errorf("TZ=%q: expected %q, got %q", value, expected, got)
		}
	}
}
