// Package backup writes and reads the household export: one ZIP holding manifest.json, one CSV per
// entity and, optionally, the receipt photos and PDFs. The format is described in docs/backup-format.md.
package backup

import (
	"crypto/rand"
	"fmt"
)

const (
	// FormatName identifies a CartVibe household export.
	FormatName = "cartvibe-backup"
	// FormatVersion changes only for a breaking change. An additive column keeps the version: readers
	// match columns by name and ignore the ones they do not know.
	FormatVersion = 1

	ManifestName = "manifest.json"

	EntryKindTable = "table"
	EntryKindFile  = "file"
)

type Manifest struct {
	Format        string           `json:"format"`
	FormatVersion int              `json:"formatVersion"`
	AppVersion    string           `json:"appVersion"`
	ExportedAt    string           `json:"exportedAt"`
	ExportId      string           `json:"exportId"`
	IncludesFiles bool             `json:"includesFiles"`
	Household     HouseholdSetting `json:"household"`
	// AllGroupIds are the synthetic All groups of the exporting server. They are never exported as
	// groups; a report template that covers one names it here so an import can map it.
	AllGroupIds  []uint          `json:"allGroupIds"`
	Entries      []ManifestEntry `json:"entries"`
	MissingFiles []string        `json:"missingFiles"`
}

type HouseholdSetting struct {
	CurrencyDisplay              string `json:"currencyDisplay"`
	CurrencyCode                 string `json:"currencyCode"`
	CurrencyThousandthsSeparator string `json:"currencyThousandthsSeparator"`
	CurrencyDecimalSeparator     string `json:"currencyDecimalSeparator"`
	CurrencySymbolPosition       string `json:"currencySymbolPosition"`
	CurrencyHideDecimalPlaces    bool   `json:"currencyHideDecimalPlaces"`
	TimeZone                     string `json:"timeZone"`
	DateFormat                   string `json:"dateFormat"`
}

// ManifestEntry describes one file in the ZIP. Rows is set for tables only.
type ManifestEntry struct {
	Name   string `json:"name"`
	Kind   string `json:"kind"`
	Rows   *int   `json:"rows,omitempty"`
	Bytes  int64  `json:"bytes"`
	Sha256 string `json:"sha256"`
}

func newExportId() (string, error) {
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}

	// A version 4 UUID.
	random[6] = (random[6] & 0x0f) | 0x40
	random[8] = (random[8] & 0x3f) | 0x80

	return fmt.Sprintf("%x-%x-%x-%x-%x", random[0:4], random[4:6], random[6:8], random[8:10], random[10:16]), nil
}

func tableEntryName(table string) string {
	return table + ".csv"
}

func receiptFileEntryName(fileId uint) string {
	return "files/" + formatUint(fileId)
}

func tripPhotoEntryName(tripId uint) string {
	return "files/trips/" + formatUint(tripId)
}
