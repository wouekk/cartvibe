package wranglerasynq

import (
	"receipt-wrangler/api/internal/structs"
	"testing"
	"time"
)

func TestSlugifySubject(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty", "", ""},
		{"simple", "Amazon Order", "amazon-order"},
		{"mixed case", "Amazon ORDER 12345", "amazon-order-12345"},
		{"punctuation collapses", "Amazon Order #12345!", "amazon-order-12345"},
		{"non-ascii stripped", "Réçu — café 5€", "r-u-caf-5"},
		{"multiple spaces collapse to single hyphen", "Order   #12345", "order-12345"},
		{"leading and trailing punctuation trimmed", "[Receipt] - Order #12345.", "receipt-order-12345"},
		{"only punctuation", "!!!", ""},
		{"truncation at 60 chars trims trailing hyphen", "this-is-a-deliberately-long-subject-line-with-many-words-in-it-extra", "this-is-a-deliberately-long-subject-line-with-many-words-in"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := slugifySubject(tc.input)
			if got != tc.expected {
				t.Errorf("slugifySubject(%q) = %q, want %q", tc.input, got, tc.expected)
			}
		})
	}
}

func TestBuildEmailBodyPdfFilename(t *testing.T) {
	date := time.Date(2026, 4, 16, 10, 30, 0, 0, time.UTC)

	cases := []struct {
		name     string
		metadata structs.EmailMetadata
		expected string
	}{
		{
			name:     "subject and date",
			metadata: structs.EmailMetadata{Subject: "Amazon Order #12345", Date: date},
			expected: "email-body-amazon-order-12345-2026-04-16.pdf",
		},
		{
			name:     "missing subject keeps date",
			metadata: structs.EmailMetadata{Subject: "", Date: date},
			expected: "email-body-2026-04-16.pdf",
		},
		{
			name:     "missing date keeps subject",
			metadata: structs.EmailMetadata{Subject: "Receipt", Date: time.Time{}},
			expected: "email-body-receipt.pdf",
		},
		{
			name:     "missing both falls back to base name",
			metadata: structs.EmailMetadata{},
			expected: "email-body.pdf",
		},
		{
			name:     "subject of only punctuation acts as missing subject",
			metadata: structs.EmailMetadata{Subject: "!!!", Date: date},
			expected: "email-body-2026-04-16.pdf",
		},
		{
			name:     "date is normalized to UTC",
			metadata: structs.EmailMetadata{Subject: "Order", Date: time.Date(2026, 4, 16, 23, 30, 0, 0, time.FixedZone("PST", -8*3600))},
			expected: "email-body-order-2026-04-17.pdf",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := buildEmailBodyPdfFilename(tc.metadata)
			if got != tc.expected {
				t.Errorf("buildEmailBodyPdfFilename(%+v) = %q, want %q", tc.metadata, got, tc.expected)
			}
		})
	}
}
