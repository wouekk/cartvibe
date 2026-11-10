package repositories

import (
	"encoding/json"
	"strings"
	"testing"

	"cartvibe/api/internal/models"
)

func TestShopLogoKeyIsStoredEncryptedAndNeverReturned(t *testing.T) {
	defer TruncateTestDb()
	t.Setenv("ENCRYPTION_KEY", "test-encryption-key")
	repository := NewSystemSettingsRepository(nil)

	command := buildSettingsCommand()
	key := " sk_ExampleSecret12345 "
	command.ShopLogoKey = &key
	saved, err := repository.UpdateSystemSettings(command)
	if err != nil {
		t.Fatal(err)
	}
	if !saved.ShopLogoKeySet {
		t.Error("the saved settings should say a key is set")
	}

	var stored models.SystemSettings
	GetDB().First(&stored)
	if stored.ShopLogoKey == "" || strings.Contains(stored.ShopLogoKey, "sk_") {
		t.Fatalf("the key must be stored encrypted, got %q", stored.ShopLogoKey)
	}
	if got := ShopLogoSecretKey(stored); got != "sk_ExampleSecret12345" {
		t.Errorf("decrypted key = %q", got)
	}

	read, err := repository.GetSystemSettings()
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(read)
	if strings.Contains(string(body), "sk_") || strings.Contains(string(body), stored.ShopLogoKey) || !read.ShopLogoKeySet {
		t.Errorf("the settings JSON must carry only shopLogoKeySet, got %s", body)
	}

	// A save without the key keeps it.
	saved, err = repository.UpdateSystemSettings(buildSettingsCommand())
	if err != nil || !saved.ShopLogoKeySet {
		t.Fatalf("an omitted key must stay saved: %v %+v", err, saved.ShopLogoKeySet)
	}

	// "" removes it.
	empty := ""
	command.ShopLogoKey = &empty
	saved, err = repository.UpdateSystemSettings(command)
	if err != nil || saved.ShopLogoKeySet {
		t.Fatalf("an empty key should remove it: %v %+v", err, saved.ShopLogoKeySet)
	}
}

func TestAPublishableKeyAnEarlierBuildStoredCountsAsNoKey(t *testing.T) {
	t.Setenv("ENCRYPTION_KEY", "test-encryption-key")
	if ShopLogoSecretKey(models.SystemSettings{ShopLogoKey: "pk_ExamplePublic123"}) != "" {
		t.Error("a plain publishable key must not count as a secret key")
	}
	if ShopLogoSecretKey(models.SystemSettings{}) != "" {
		t.Error("no key is no key")
	}
}
