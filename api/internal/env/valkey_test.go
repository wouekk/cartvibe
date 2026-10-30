package env

import "testing"

func TestGetValkeyConfigDefaultsToTheComposeService(t *testing.T) {
	t.Setenv("VALKEY_HOST", "")
	t.Setenv("VALKEY_PORT", "")
	t.Setenv("VALKEY_USER", "")
	t.Setenv("VALKEY_PASSWORD", "")

	options, err := GetAsynqClientOptions()
	if err != nil {
		t.Fatal(err)
	}
	if options.Addr != "valkey:6379" || options.Username != "" || options.Password != "" {
		t.Errorf("expected valkey:6379 without credentials, got %+v", options)
	}
}

func TestGetValkeyConfigReadsTheVariables(t *testing.T) {
	t.Setenv("VALKEY_HOST", "queue.internal")
	t.Setenv("VALKEY_PORT", "6400")
	t.Setenv("VALKEY_USER", "cartvibe")
	t.Setenv("VALKEY_PASSWORD", "secret")

	options, err := GetAsynqClientOptions()
	if err != nil {
		t.Fatal(err)
	}
	if options.Addr != "queue.internal:6400" || options.Username != "cartvibe" || options.Password != "secret" {
		t.Errorf("unexpected options %+v", options)
	}
}

func TestGetValkeyConfigRejectsABadPort(t *testing.T) {
	t.Setenv("VALKEY_PORT", "six")

	if _, err := GetValkeyConfig(); err == nil {
		t.Error("expected an error for a port that is not a number")
	}
}
