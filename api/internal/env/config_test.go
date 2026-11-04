package env

import (
	"os"
	"cartvibe/api/internal/cell"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/utils"
	"testing"
)

func TestMain(m *testing.M) {
	// Initialize logging once for the package because GetChromiumSandboxEnabled
	// and GetChromiumAllowExternalResources emit INFO logs on unparseable
	// values, and logging.LogStd uses package-level loggers that must be set up.
	if err := logging.InitLog(); err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}

func tearDownConfigTests() {
	os.Unsetenv("DB_ENGINE")
	os.Unsetenv("DB_FILENAME")
}

func TestShouldGetEmptyDatabaseConfig(t *testing.T) {
	tearDownConfigTests()

	dbConfig, err := GetDatabaseConfig()
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	if dbConfig.Engine != "" {
		utils.PrintTestError(t, "Expected empty string", dbConfig)
	}

	if dbConfig.Filename != "" {
		utils.PrintTestError(t, "Expected empty string", dbConfig)
	}
}

func TestShouldGetFullConfigForSqlite(t *testing.T) {
	defer tearDownConfigTests()

	os.Setenv("DB_ENGINE", "sqlite")
	os.Setenv("DB_FILENAME", "test_filename")

	dbConfig, err := GetDatabaseConfig()
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	if dbConfig.Engine != "sqlite" {
		utils.PrintTestError(t, "Expected sqlite", dbConfig.Engine)
	}

	if dbConfig.Filename != "test_filename" {
		utils.PrintTestError(t, "Expected test_filename", dbConfig.Filename)
	}
}

// A leftover DB_PORT from a MariaDB or PostgreSQL setup is not read any more, so a bad value no longer
// matters here; repositories.Connect refuses the engine itself.
func TestShouldIgnoreTheRemovedNetworkSettings(t *testing.T) {
	defer tearDownConfigTests()
	t.Setenv("DB_PORT", "not a number")
	os.Setenv("DB_ENGINE", "postgresql")

	dbConfig, err := GetDatabaseConfig()
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	if dbConfig.Engine != "postgresql" {
		utils.PrintTestError(t, "Expected the engine as set", dbConfig.Engine)
	}
}

func TestGetChromiumSandboxEnabled(t *testing.T) {
	cases := []struct {
		name     string
		envValue string
		setEnv   bool
		expected bool
	}{
		{"unset defaults to false", "", false, false},
		{"empty string defaults to false", "", true, false},
		{"true enables sandbox", "true", true, true},
		{"1 enables sandbox", "1", true, true},
		{"TRUE enables sandbox", "TRUE", true, true},
		{"false keeps default", "false", true, false},
		{"0 keeps default", "0", true, false},
		{"unparseable keeps default", "yes-please", true, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			os.Unsetenv("CHROMIUM_SANDBOX")
			if tc.setEnv {
				os.Setenv("CHROMIUM_SANDBOX", tc.envValue)
				defer os.Unsetenv("CHROMIUM_SANDBOX")
			}

			got := GetChromiumSandboxEnabled()
			if got != tc.expected {
				t.Errorf("GetChromiumSandboxEnabled() with env=%q (set=%v) = %v, want %v",
					tc.envValue, tc.setEnv, got, tc.expected)
			}
		})
	}
}

func TestGetChromiumAllowExternalResources(t *testing.T) {
	cases := []struct {
		name     string
		envValue string
		setEnv   bool
		expected bool
	}{
		{"unset defaults to false (blocked)", "", false, false},
		{"empty string defaults to false", "", true, false},
		{"true allows external resources", "true", true, true},
		{"1 allows external resources", "1", true, true},
		{"false keeps default (blocked)", "false", true, false},
		{"0 keeps default (blocked)", "0", true, false},
		{"unparseable keeps default (blocked)", "on", true, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			os.Unsetenv("CHROMIUM_ALLOW_EXTERNAL_RESOURCES")
			if tc.setEnv {
				os.Setenv("CHROMIUM_ALLOW_EXTERNAL_RESOURCES", tc.envValue)
				defer os.Unsetenv("CHROMIUM_ALLOW_EXTERNAL_RESOURCES")
			}

			got := GetChromiumAllowExternalResources()
			if got != tc.expected {
				t.Errorf("GetChromiumAllowExternalResources() with env=%q (set=%v) = %v, want %v",
					tc.envValue, tc.setEnv, got, tc.expected)
			}
		})
	}
}

func TestFindBasePath(t *testing.T) {
	tests := []struct {
		name string
		cwd  string
		want string
	}{
		{"image folder", "/app/cartvibe-api", "/app/cartvibe-api"},
		{"image folder, nested cwd", "/app/cartvibe-api/internal/env", "/app/cartvibe-api"},
		{"upstream folder name is not a root", "/app/receipt-wrangler-api/sub", ""},
		{"windows path", `C:\work\cartvibe-api\sub`, "C:/work/cartvibe-api"},
		{"local api checkout", "/home/me/cartvibe/api", "/home/me/cartvibe/api"},
		{"unknown folder", "/tmp/elsewhere", ""},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := findBasePath(test.cwd); got != test.want {
				t.Errorf("findBasePath(%q) = %q, want %q", test.cwd, got, test.want)
			}
		})
	}
}

func TestShouldDefaultToStandaloneMode(t *testing.T) {
	os.Unsetenv("CARTVIBE_MODE")

	mode, err := GetCellMode()
	if err != nil {
		t.Fatal(err)
	}
	if mode != cell.ModeStandalone || !mode.Implemented() {
		t.Errorf("an unset CARTVIBE_MODE must be standalone, got %q", mode)
	}
}

func TestShouldReadReservedAndRejectUnknownModes(t *testing.T) {
	defer os.Unsetenv("CARTVIBE_MODE")

	os.Setenv("CARTVIBE_MODE", "worker")
	mode, err := GetCellMode()
	if err != nil || mode != cell.ModeWorker || mode.Implemented() {
		t.Errorf("worker must parse and be reported as not implemented, got %q (%v)", mode, err)
	}

	os.Setenv("CARTVIBE_MODE", "nonsense")
	if _, err := GetCellMode(); err == nil {
		t.Error("an unknown CARTVIBE_MODE must be an error")
	}
}
