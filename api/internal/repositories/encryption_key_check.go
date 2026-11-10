package repositories

import (
	"fmt"

	"gorm.io/gorm"
)

// MinEncryptionKeyLength is the shortest ENCRYPTION_KEY a new install accepts. The stored secrets (AI keys, the
// Logo.dev key, provider secrets) are encrypted with a key derived from it, so a short one could be guessed from a
// copy of the database. `openssl rand -hex 32` gives 64 characters.
const MinEncryptionKeyLength = 32

// CheckEncryptionKey judges ENCRYPTION_KEY before the schema is touched. A new install (no users table yet) with a
// short key is refused: nothing is encrypted yet, so choosing a longer one costs nothing. An existing install with a
// short key gets a warning only, because a new key would make every stored secret unreadable; the warning says how to
// move to a longer one.
func CheckEncryptionKey(target *gorm.DB, key string) (warning string, err error) {
	if len(key) >= MinEncryptionKeyLength {
		return "", nil
	}
	if !target.Migrator().HasTable("users") {
		return "", fmt.Errorf("ENCRYPTION_KEY is %d characters long; a new install needs at least %d "+
			"(for example the output of `openssl rand -hex 32`)", len(key), MinEncryptionKeyLength)
	}
	return fmt.Sprintf("ENCRYPTION_KEY is %d characters long, shorter than the %d a new install needs. It keeps working; "+
		"to move to a longer key, change it and then enter the AI, Logo.dev and sign-in provider keys again in System "+
		"Settings", len(key), MinEncryptionKeyLength), nil
}

// CheckEncryptionKeyOfThisDatabase runs CheckEncryptionKey on the process database.
func CheckEncryptionKeyOfThisDatabase(key string) (string, error) {
	return CheckEncryptionKey(db, key)
}
