package repositories

import (
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestCheckEncryptionKeyRefusesAShortKeyOnANewInstallOnly(t *testing.T) {
	fresh, err := gorm.Open(sqlite.Open("file:"+t.TempDir()+"/fresh.db"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := fresh.DB()
	defer sqlDB.Close()

	if _, err := CheckEncryptionKey(fresh, "short"); err == nil || !strings.Contains(err.Error(), "at least 32") {
		t.Fatalf("expected a new install to refuse a short key, got %v", err)
	}
	if warning, err := CheckEncryptionKey(fresh, strings.Repeat("k", MinEncryptionKeyLength)); err != nil || warning != "" {
		t.Fatalf("expected a 32-character key to pass, got %q, %v", warning, err)
	}

	// The test database has a users table: an existing install keeps its short key with a warning.
	warning, err := CheckEncryptionKey(db, "short")
	if err != nil {
		t.Fatalf("expected an existing install to keep running, got %v", err)
	}
	if !strings.Contains(warning, "5 characters") {
		t.Fatalf("expected a warning naming the length, got %q", warning)
	}
}
