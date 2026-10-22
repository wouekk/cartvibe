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
