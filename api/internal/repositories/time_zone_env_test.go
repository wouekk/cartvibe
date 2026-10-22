package repositories

import (
	"cartvibe/api/internal/models"
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

func TestAdoptTimeZoneFromEnvOnlyReplacesTheDefault(t *testing.T) {
	defer TruncateTestDb()
	t.Setenv("TZ", "Europe/Berlin")

	settings, _ := NewSystemSettingsRepository(nil).GetSystemSettings()
	if settings.TimeZone != "UTC" {
		t.Fatalf("expected the test database to start on UTC, got %q", settings.TimeZone)
	}

	if err := adoptTimeZoneFromEnv(GetDB()); err != nil {
		t.Fatal(err)
	}
	settings, _ = NewSystemSettingsRepository(nil).GetSystemSettings()
	if settings.TimeZone != "Europe/Berlin" {
		t.Errorf("expected the TZ zone, got %q", settings.TimeZone)
	}

	// A zone an administrator chose is left alone.
	GetDB().Model(&models.SystemSettings{}).Where("id = ?", settings.ID).Update("time_zone", "America/New_York")
	if err := adoptTimeZoneFromEnv(GetDB()); err != nil {
		t.Fatal(err)
	}
	settings, _ = NewSystemSettingsRepository(nil).GetSystemSettings()
	if settings.TimeZone != "America/New_York" {
		t.Errorf("a chosen zone must not be overwritten, got %q", settings.TimeZone)
	}
}
