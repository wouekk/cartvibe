package repositories

import (
	"cartvibe/api/internal/models"
	"testing"
)

func TestSeedEuroForNewInstallOnlyActsOnAnEmptyInstall(t *testing.T) {
	defer TruncateTestDb()

	if err := SeedEuroForNewInstall(); err != nil {
		t.Fatal(err)
	}
	settings, _ := NewSystemSettingsRepository(nil).GetSystemSettings()
	if settings.CurrencyDisplay != " €" || settings.CurrencySymbolPosition != models.END ||
		settings.CurrencyDecimalSeparator != models.COMMA || settings.CurrencyThousandthsSeparator != models.DOT {
		t.Errorf("expected euro formatting, got %+v", settings)
	}

	// A second run, and an install that already has a row, are left alone.
	GetDB().Model(&models.SystemSettings{}).Where("id = 1").Update("currency_display", "$")
	if err := SeedEuroForNewInstall(); err != nil {
		t.Fatal(err)
	}
	settings, _ = NewSystemSettingsRepository(nil).GetSystemSettings()
	if settings.CurrencyDisplay != "$" {
		t.Errorf("an existing row was overwritten: %q", settings.CurrencyDisplay)
	}
}

// The whole startup path, not just the seed: InitDB used to create an empty (dollar) settings row
// before the euro seed ran, so a fresh install never got euros.
func TestInitDBStartsAFreshInstallOnEurosInTheEnvTimeZone(t *testing.T) {
	defer TruncateTestDb()
	TruncateTestDb()
	t.Setenv("TZ", "Europe/Warsaw")

	if err := InitDB(); err != nil {
		t.Fatal(err)
	}

	var rows int64
	GetDB().Model(&models.SystemSettings{}).Count(&rows)
	if rows != 1 {
		t.Fatalf("expected one settings row, got %d", rows)
	}
	settings, err := NewSystemSettingsRepository(nil).GetSystemSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.CurrencyDisplay != " €" || settings.CurrencySymbolPosition != models.END ||
		settings.CurrencyDecimalSeparator != models.COMMA || settings.CurrencyThousandthsSeparator != models.DOT {
		t.Errorf("a fresh install should start on euros, got %q %q %q %q", settings.CurrencyDisplay,
			settings.CurrencySymbolPosition, settings.CurrencyThousandthsSeparator, settings.CurrencyDecimalSeparator)
	}
	if settings.TimeZone != "Europe/Warsaw" {
		t.Errorf("expected the TZ time zone, got %q", settings.TimeZone)
	}
}
