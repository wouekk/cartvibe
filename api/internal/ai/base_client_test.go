package ai

import (
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func newBaseClientWithKey(key string) BaseClient {
	return BaseClient{
		Options: structs.AiChatCompletionOptions{},
		ReceiptProcessingSettings: models.ReceiptProcessingSettings{
			Key: key,
		},
	}
}

func TestGetKey_NoDecrypt_ReturnsRawKey(t *testing.T) {
	client := newBaseClientWithKey("raw-key-unchanged")

	got, err := client.getKey(false)
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if got != "raw-key-unchanged" {
		utils.PrintTestError(t, got, "raw-key-unchanged")
	}
}

func TestGetKey_DecryptWithEmptyKey_ReturnsEmpty(t *testing.T) {
	client := newBaseClientWithKey("")

	got, err := client.getKey(true)
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if got != "" {
		utils.PrintTestError(t, got, "")
	}
}

func TestGetKey_DecryptRoundTrip(t *testing.T) {
	encryptionKey := "test-encryption-key"
	t.Setenv("ENCRYPTION_KEY", encryptionKey)

	plaintext := "sk-proj-abc123"
	encoded, err := utils.EncryptAndEncodeToBase64(encryptionKey, plaintext)
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}

	client := newBaseClientWithKey(encoded)
	got, err := client.getKey(true)
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if got != plaintext {
		utils.PrintTestError(t, got, plaintext)
	}
}

func TestDecryptKey_InvalidBase64_ReturnsError(t *testing.T) {
	t.Setenv("ENCRYPTION_KEY", "test-encryption-key")

	// "@@@" is not valid base64.
	client := newBaseClientWithKey("@@@")
	_, err := client.decryptKey()
	if err == nil {
		utils.PrintTestError(t, err, "expected base64 decode error")
	}
}

func TestDecryptKey_WrongEncryptionKey_ReturnsError(t *testing.T) {
	goodKey := "the-good-key"
	badKey := "the-bad-key"

	encoded, err := utils.EncryptAndEncodeToBase64(goodKey, "payload")
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}

	t.Setenv("ENCRYPTION_KEY", badKey)
	client := newBaseClientWithKey(encoded)

	_, err = client.decryptKey()
	if err == nil {
		utils.PrintTestError(t, err, "expected decryption error")
	}
}

func TestGetKey_Decrypt_DelegatesToDecryptKey(t *testing.T) {
	encryptionKey := "consistent-key"
	t.Setenv("ENCRYPTION_KEY", encryptionKey)

	encoded, err := utils.EncryptAndEncodeToBase64(encryptionKey, "unwrapped")
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}

	client := newBaseClientWithKey(encoded)
	got, err := client.getKey(true)
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if got != "unwrapped" {
		utils.PrintTestError(t, got, "unwrapped")
	}
}
