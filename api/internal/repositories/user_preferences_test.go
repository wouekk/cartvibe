package repositories

import (
	"github.com/shopspring/decimal"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"testing"
)

// UpdateUserPreferences copies the request onto the stored row one field at a
// time, so a field missing from that block silently never persists - no compile
// error, no failing test anywhere else. These round-trips are what catch it.
func TestUpdateUserPreferencesRoundTripsCloseChipSelectOnSelect(t *testing.T) {
	defer TruncateTestDb()
	CreateTestUser()

	repository := NewUserPreferencesRepository(nil)

	created, err := repository.GetUserPreferencesOrCreate(1)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if created.CloseChipSelectOnSelect {
		utils.PrintTestError(t, created.CloseChipSelectOnSelect, false)
	}

	updated, err := repository.UpdateUserPreferences(1, models.UserPrefernces{
		CloseChipSelectOnSelect: true,
	})
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !updated.CloseChipSelectOnSelect {
		utils.PrintTestError(t, updated.CloseChipSelectOnSelect, true)
	}

	read, err := repository.GetUserPreferencesOrCreate(1)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !read.CloseChipSelectOnSelect {
		utils.PrintTestError(t, read.CloseChipSelectOnSelect, true)
	}
}

// GORM's struct-form Updates skips zero values, so a boolean that is turned
// back off is the case that regresses. The repository writes with Select("*"),
// which is what makes the false stick.
func TestUpdateUserPreferencesTurnsCloseChipSelectOnSelectBackOff(t *testing.T) {
	defer TruncateTestDb()
	CreateTestUser()

	repository := NewUserPreferencesRepository(nil)

	_, err := repository.GetUserPreferencesOrCreate(1)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	_, err = repository.UpdateUserPreferences(1, models.UserPrefernces{
		CloseChipSelectOnSelect: true,
	})
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	_, err = repository.UpdateUserPreferences(1, models.UserPrefernces{
		CloseChipSelectOnSelect: false,
	})
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	read, err := repository.GetUserPreferencesOrCreate(1)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if read.CloseChipSelectOnSelect {
		utils.PrintTestError(t, read.CloseChipSelectOnSelect, false)
	}
}

func TestUpdateUserPreferencesRoundTripsAndClearsTheMonthlySpendingGoal(t *testing.T) {
	defer TruncateTestDb()
	CreateTestUser()

	repository := NewUserPreferencesRepository(nil)
	if _, err := repository.GetUserPreferencesOrCreate(1); err != nil {
		t.Fatal(err)
	}

	goal := decimal.RequireFromString("500.50")
	updated, err := repository.UpdateUserPreferences(1, models.UserPrefernces{MonthlySpendingGoal: &goal})
	if err != nil {
		t.Fatal(err)
	}
	if updated.MonthlySpendingGoal == nil || updated.MonthlySpendingGoal.String() != "500.5" {
		t.Fatalf("expected the goal to be stored, got %v", updated.MonthlySpendingGoal)
	}

	// Clearing it (no value) must stick: the row is written with Select("*").
	cleared, err := repository.UpdateUserPreferences(1, models.UserPrefernces{})
	if err != nil {
		t.Fatal(err)
	}
	read, _ := repository.GetUserPreferencesOrCreate(1)
	if cleared.MonthlySpendingGoal != nil || read.MonthlySpendingGoal != nil {
		t.Errorf("a cleared goal should read back as none, got %v", read.MonthlySpendingGoal)
	}
}

func TestUpdateUserPreferencesStoresTheDisplayCurrencyAndItsRate(t *testing.T) {
	defer TruncateTestDb()
	CreateTestUser()

	repository := NewUserPreferencesRepository(nil)
	if _, err := repository.GetUserPreferencesOrCreate(1); err != nil {
		t.Fatal(err)
	}

	rate := decimal.RequireFromString("4.25")
	updated, err := repository.UpdateUserPreferences(1, models.UserPrefernces{DisplayCurrency: " pln ", DisplayCurrencyRate: &rate})
	if err != nil {
		t.Fatal(err)
	}
	if updated.DisplayCurrency != "PLN" {
		t.Errorf("the code should be trimmed and upper-cased, got %q", updated.DisplayCurrency)
	}
	if updated.DisplayCurrencyRate == nil || updated.DisplayCurrencyRate.String() != "4.25" {
		t.Errorf("expected the rate to be stored, got %v", updated.DisplayCurrencyRate)
	}

	cleared, err := repository.UpdateUserPreferences(1, models.UserPrefernces{})
	if err != nil {
		t.Fatal(err)
	}
	if cleared.DisplayCurrency != "" || cleared.DisplayCurrencyRate != nil {
		t.Errorf("clearing should stick, got %q %v", cleared.DisplayCurrency, cleared.DisplayCurrencyRate)
	}
}

func TestUpdateUserPreferencesStoresWellFormedLanguageCodes(t *testing.T) {
	defer TruncateTestDb()
	CreateTestUser()

	repository := NewUserPreferencesRepository(nil)
	if _, err := repository.GetUserPreferencesOrCreate(1); err != nil {
		t.Fatal(err)
	}

	for language, want := range map[string]string{" PL ": "pl", "en": "en", "pt-BR": "pt-br", "de": "de", "english!": "", "x": "", "": ""} {
		updated, err := repository.UpdateUserPreferences(1, models.UserPrefernces{Language: language})
		if err != nil {
			t.Fatal(err)
		}
		if updated.Language != want {
			t.Errorf("language %q should be stored as %q, got %q", language, want, updated.Language)
		}
	}
}

// A new account is greeted once (language, theme, currency); preferences created later for an older
// account are not, and the desktop turns the flag off through the ordinary update.
func TestOnboardingPendingIsOnForNewAccountsAndTurnsOff(t *testing.T) {
	defer TruncateTestDb()

	created, err := NewUserRepository(nil).CreateUser(commands.SignUpCommand{
		Username:    "newcomer",
		DisplayName: "Newcomer",
		Password:    "a really secure password",
	})
	if err != nil {
		t.Fatal(err)
	}

	repository := NewUserPreferencesRepository(nil)
	preferences, err := repository.GetUserPreferencesOrCreate(created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !preferences.OnboardingPending {
		t.Errorf("a new account should start with the welcome pending")
	}

	preferences.OnboardingPending = false
	if _, err := repository.UpdateUserPreferences(created.ID, preferences); err != nil {
		t.Fatal(err)
	}
	read, _ := repository.GetUserPreferencesOrCreate(created.ID)
	if read.OnboardingPending {
		t.Errorf("the welcome should stay done once turned off")
	}

	// Preferences made on demand for an account that had none (an older account) are not greeted.
	CreateTestUser()
	var older models.User
	GetDB().Where("username = ?", "test").First(&older)
	lazy, err := repository.GetUserPreferencesOrCreate(older.ID)
	if err != nil {
		t.Fatal(err)
	}
	if lazy.OnboardingPending {
		t.Errorf("an older account should not see the welcome")
	}
}
