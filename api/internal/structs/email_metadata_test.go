package structs

import (
	"encoding/json"
	"testing"
)

func TestEmailMetadata_UnmarshalWithBody(t *testing.T) {
	jsonData := `{
		"date": "2024-01-15T10:30:00Z",
		"subject": "Your Receipt",
		"to": "user@example.com",
		"fromName": "Store",
		"fromEmail": "store@example.com",
		"body": "Order total: $25.00",
		"attachments": [],
		"groupSettingsIds": [1, 2]
	}`

	var metadata EmailMetadata
	err := json.Unmarshal([]byte(jsonData), &metadata)
	if err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if metadata.Body != "Order total: $25.00" {
		t.Errorf("Expected body 'Order total: $25.00', got '%s'", metadata.Body)
	}
	if metadata.Subject != "Your Receipt" {
		t.Errorf("Expected subject 'Your Receipt', got '%s'", metadata.Subject)
	}
	if metadata.FromEmail != "store@example.com" {
		t.Errorf("Expected fromEmail 'store@example.com', got '%s'", metadata.FromEmail)
	}
	if len(metadata.GroupSettingsIds) != 2 {
		t.Errorf("Expected 2 group settings IDs, got %d", len(metadata.GroupSettingsIds))
	}
}

func TestEmailMetadata_UnmarshalWithoutBody(t *testing.T) {
	jsonData := `{
		"date": "2024-01-15T10:30:00Z",
		"subject": "Your Receipt",
		"to": "user@example.com",
		"fromName": "Store",
		"fromEmail": "store@example.com",
		"attachments": [{"filename": "receipt.jpg", "fileType": "image/jpeg", "size": 1024}],
		"groupSettingsIds": [1]
	}`

	var metadata EmailMetadata
	err := json.Unmarshal([]byte(jsonData), &metadata)
	if err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if metadata.Body != "" {
		t.Errorf("Expected empty body, got '%s'", metadata.Body)
	}
	if len(metadata.Attachments) != 1 {
		t.Errorf("Expected 1 attachment, got %d", len(metadata.Attachments))
	}
	if metadata.Attachments[0].Filename != "receipt.jpg" {
		t.Errorf("Expected filename 'receipt.jpg', got '%s'", metadata.Attachments[0].Filename)
	}
}

func TestEmailMetadata_MarshalIncludesBody(t *testing.T) {
	metadata := EmailMetadata{
		Subject:          "Test",
		To:               "test@test.com",
		FromName:         "Test",
		FromEmail:        "test@test.com",
		Body:             "Receipt content",
		Attachments:      []Attachment{},
		GroupSettingsIds: []uint{1},
	}

	bytes, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var result map[string]interface{}
	err = json.Unmarshal(bytes, &result)
	if err != nil {
		t.Fatalf("Failed to unmarshal result: %v", err)
	}

	body, ok := result["body"]
	if !ok {
		t.Error("Expected 'body' field in marshaled JSON")
	}
	if body != "Receipt content" {
		t.Errorf("Expected body 'Receipt content', got '%v'", body)
	}
}
