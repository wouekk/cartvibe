package handlers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
)

func tearDownSystemSettingsTest() {
	repositories.TruncateTestDb()
}

func TestShouldNotAllowUserToGetSystemSettings(t *testing.T) {
	defer tearDownSystemSettingsTest()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	expectedStatusCode := http.StatusForbidden

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	GetSystemSettings(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldGetSystemSettingsWhenThereAreNoSettings(t *testing.T) {
	defer tearDownSystemSettingsTest()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	expectedStatusCode := http.StatusOK

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	grantAllAppPerms(t, 1)

	GetSystemSettings(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldGetSystemSettingsWhenThereAreExistingSettings(t *testing.T) {
	defer tearDownSystemSettingsTest()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	expectedStatusCode := http.StatusOK

	db := repositories.GetDB()
	db.Create(&models.SystemSettings{})

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	grantAllAppPerms(t, 1)

	GetSystemSettings(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldValidateUpsertSystemSettingsCommand(t *testing.T) {
	defer tearDownGroupTests()
	db := repositories.GetDB()
	db.Create(&models.SystemSettings{})
	db.Create(&models.ReceiptProcessingSettings{
		Name:     "test",
	})
	db.Create(&models.ReceiptProcessingSettings{
		Name:     "test2",
	})

	id := uint(1)
	id2 := uint(2)

	tests := map[string]struct {
		input  commands.UpsertSystemSettingsCommand
		expect int
	}{
		"empty body": {
			expect: http.StatusBadRequest,
		},
		"empty command": {
			input:  commands.UpsertSystemSettingsCommand{},
			expect: http.StatusBadRequest,
		},
		"invalid email polling interval": {
			input: commands.UpsertSystemSettingsCommand{
			},
			expect: http.StatusBadRequest,
		},
		"invalid receipt processing settings ID": {
			input: commands.UpsertSystemSettingsCommand{
				ReceiptProcessingSettingsId: new(uint),
			},
			expect: http.StatusBadRequest,
		},
		"invalid fallback receipt processing settings ID": {
			input: commands.UpsertSystemSettingsCommand{
				FallbackReceiptProcessingSettingsId: new(uint),
			},
			expect: http.StatusBadRequest,
		},
		"fallback receipt processing settings ID without receipt processing settings ID": {
			input: commands.UpsertSystemSettingsCommand{
				FallbackReceiptProcessingSettingsId: &id,
			},
			expect: http.StatusBadRequest,
		},
		"fallback receipt processing settings ID same as receipt processing settings ID": {
			input: commands.UpsertSystemSettingsCommand{
				ReceiptProcessingSettingsId:         &id,
				FallbackReceiptProcessingSettingsId: &id,
			},
			expect: http.StatusBadRequest,
		},
		"missing currency thousandths separator": {
			input: commands.UpsertSystemSettingsCommand{
				EnableLocalSignUp:                   true,
				ReceiptProcessingSettingsId:         &id,
				FallbackReceiptProcessingSettingsId: &id2,
				CurrencyDecimalSeparator:            models.DOT,
				CurrencySymbolPosition:              models.START,
			},
			expect: http.StatusBadRequest,
		},
		"missing currency decimal separator": {
			input: commands.UpsertSystemSettingsCommand{
				EnableLocalSignUp:                   true,
				ReceiptProcessingSettingsId:         &id,
				FallbackReceiptProcessingSettingsId: &id2,
				CurrencyThousandthsSeparator:        models.COMMA,
				CurrencySymbolPosition:              models.START,
			},
			expect: http.StatusBadRequest,
		},
		"missing missing currency symbol position": {
			input: commands.UpsertSystemSettingsCommand{
				EnableLocalSignUp:                   true,
				ReceiptProcessingSettingsId:         &id,
				FallbackReceiptProcessingSettingsId: &id2,
				CurrencyThousandthsSeparator:        models.COMMA,
				CurrencyDecimalSeparator:            models.DOT,
			},
			expect: http.StatusBadRequest,
		},
		"valid command": {
			input: commands.UpsertSystemSettingsCommand{
				CurrencyDisplay:                     "something else",
				EnableLocalSignUp:                   true,
				ReceiptProcessingSettingsId:         &id,
				FallbackReceiptProcessingSettingsId: &id2,
				CurrencyThousandthsSeparator:        models.COMMA,
				CurrencyDecimalSeparator:            models.DOT,
				CurrencySymbolPosition:              models.START,
			},
			expect: http.StatusOK,
		},
	}

	grantAllAppPerms(t, 1)

	for _, test := range tests {
		bytes, _ := json.Marshal(test.input)
		reader := strings.NewReader(string(bytes))
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api", reader)

		newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
		r = r.WithContext(newContext)

		UpdateSystemSettings(w, r)

		if w.Result().StatusCode != test.expect {
			utils.PrintTestError(t, w.Result().StatusCode, test.expect)
		}
	}
}

// Regression: the update writes every column via Select("*"), so a PUT body that
// omits a configured lifetime used to persist 0 and silently reset an admin's
// session length to the default. Driven through the handler with a RAW JSON body
// rather than a typed command, because the whole point is which keys are absent
// from the wire -- a struct literal cannot express that.
func TestUpdateSystemSettingsPreservesOmittedRefreshTokenLifetimes(t *testing.T) {
	defer tearDownSystemSettingsTest()

	db := repositories.GetDB()
	db.Create(&models.SystemSettings{})
	grantAllAppPerms(t, 1)

	// An admin has configured both lifetimes away from the defaults.
	err := db.Model(&models.SystemSettings{}).
		Where("id = ?", 1).
		Updates(map[string]interface{}{
			"refresh_token_valid_for_hours":     720,
			"mcp_refresh_token_valid_for_hours": 6,
			"temp_file_retention_hours":         1080,
			"secure_cookies":                    true,
		}).Error
	if err != nil {
		t.Fatalf("failed to seed configured lifetimes: %v", err)
	}

	// A valid body that simply does not mention either lifetime key.
	body := map[string]interface{}{
		"currencyDisplay":              "$",
		"currencySymbolPosition":       models.START,
		"currencyThousandthsSeparator": models.COMMA,
		"currencyDecimalSeparator":     models.DOT,
		"currencyHideDecimalPlaces":    false,
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("failed to marshal body: %v", err)
	}

	r := httptest.NewRequest("PUT", "/api", strings.NewReader(string(bodyBytes)))
	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)
	w := httptest.NewRecorder()

	UpdateSystemSettings(w, r)

	if w.Result().StatusCode != http.StatusOK {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusOK)
	}

	updated, err := repositories.NewSystemSettingsRepository(nil).GetSystemSettings()
	if err != nil {
		t.Fatalf("failed to read back system settings: %v", err)
	}

	if updated.RefreshTokenValidForHours != 720 {
		utils.PrintTestError(t, updated.RefreshTokenValidForHours, 720)
	}

	if updated.McpRefreshTokenValidForHours != 6 {
		utils.PrintTestError(t, updated.McpRefreshTokenValidForHours, 6)
	}

	// Same hazard, same fix: the retention window is a pointer on the command and
	// is dropped from the UPDATE when the key is absent.
	if updated.TempFileRetentionHours != 1080 {
		utils.PrintTestError(t, updated.TempFileRetentionHours, 1080)
	}

	// A security toggle has the most to lose here: a client that does not know
	// the key must not silently turn Secure cookies back off.
	if !updated.SecureCookies {
		utils.PrintTestError(t, updated.SecureCookies, true)
	}
}

// The flip side: an explicitly sent value must still be written, so the merge
// above cannot be mistaken for "these fields are read-only".
func TestUpdateSystemSettingsPersistsExplicitRefreshTokenLifetimes(t *testing.T) {
	defer tearDownSystemSettingsTest()

	db := repositories.GetDB()
	db.Create(&models.SystemSettings{})
	grantAllAppPerms(t, 1)

	appHours := 168
	mcpHours := 12
	secureCookies := true
	command := commands.UpsertSystemSettingsCommand{
		CurrencyDisplay:              "$",
		CurrencySymbolPosition:       models.START,
		CurrencyThousandthsSeparator: models.COMMA,
		CurrencyDecimalSeparator:     models.DOT,
		RefreshTokenValidForHours:    &appHours,
		McpRefreshTokenValidForHours: &mcpHours,
		SecureCookies:                &secureCookies,
	}
	bodyBytes, err := json.Marshal(command)
	if err != nil {
		t.Fatalf("failed to marshal command: %v", err)
	}

	r := httptest.NewRequest("PUT", "/api", strings.NewReader(string(bodyBytes)))
	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)
	w := httptest.NewRecorder()

	UpdateSystemSettings(w, r)

	if w.Result().StatusCode != http.StatusOK {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusOK)
	}

	updated, err := repositories.NewSystemSettingsRepository(nil).GetSystemSettings()
	if err != nil {
		t.Fatalf("failed to read back system settings: %v", err)
	}

	if updated.RefreshTokenValidForHours != appHours {
		utils.PrintTestError(t, updated.RefreshTokenValidForHours, appHours)
	}

	if updated.McpRefreshTokenValidForHours != mcpHours {
		utils.PrintTestError(t, updated.McpRefreshTokenValidForHours, mcpHours)
	}

	if !updated.SecureCookies {
		utils.PrintTestError(t, updated.SecureCookies, true)
	}
}
