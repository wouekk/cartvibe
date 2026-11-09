package repositories

import (
	"cartvibe/api/internal/models"
	"testing"
)

func storedLifetimes(t *testing.T) (int, int) {
	t.Helper()

	var settings models.SystemSettings
	if err := GetDB().First(&settings).Error; err != nil {
		t.Fatal(err)
	}

	return settings.RefreshTokenValidForHours, settings.McpRefreshTokenValidForHours
}

func setStoredLifetimes(t *testing.T, sessionHours int, mcpHours int) {
	t.Helper()

	if _, err := NewSystemSettingsRepository(ImplicitCell(), nil).GetSystemSettings(); err != nil {
		t.Fatal(err)
	}
	err := GetDB().Model(&models.SystemSettings{}).Where("1 = 1").Updates(map[string]any{
		"refresh_token_valid_for_hours":     sessionHours,
		"mcp_refresh_token_valid_for_hours": mcpHours,
	}).Error
	if err != nil {
		t.Fatal(err)
	}
}

// The old default of a day (or nothing) becomes 30 days; a value somebody chose stays; the connector lifetime is
// never touched.
func TestSessionLifetimeMigration(t *testing.T) {
	for name, testCase := range map[string]struct {
		stored int
		want   int
	}{
		"the old default of 24 hours is lifted": {24, DefaultSessionLifetimeHours},
		"an unset value is lifted":              {0, DefaultSessionLifetimeHours},
		"a week somebody chose stays":           {168, 168},
		"an hour somebody chose stays":          {1, 1},
		"30 days stays":                         {720, 720},
	} {
		t.Run(name, func(t *testing.T) {
			defer TruncateTestDb()
			setStoredLifetimes(t, testCase.stored, 24)

			if err := runSessionLifetimeMigration(GetDB()); err != nil {
				t.Fatal(err)
			}

			session, mcp := storedLifetimes(t)
			if session != testCase.want {
				t.Errorf("session lifetime = %d, want %d", session, testCase.want)
			}
			if mcp != 24 {
				t.Errorf("the connector lifetime must stay 24, got %d", mcp)
			}
		})
	}
}
