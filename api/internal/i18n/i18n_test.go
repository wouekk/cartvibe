package i18n

import (
	"encoding/json"
	"path"
	"regexp"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"
)

// Every embedded locale file parses, and every translation keeps exactly the {placeholders} of its English key, so a
// filled-in text never loses a value or shows a raw token. npm run i18n:check guards the same on the desktop side;
// this catches a hand edit of a generated file.
func TestLocaleFilesParseAndKeepPlaceholders(t *testing.T) {
	placeholder := regexp.MustCompile(`\{\w+\}`)
	placeholdersOf := func(text string) string {
		found := placeholder.FindAllString(text, -1)
		sort.Strings(found)
		return strings.Join(found, ",")
	}

	entries, err := localeFiles.ReadDir("locales")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 {
		t.Fatal("no locale files embedded")
	}
	for _, entry := range entries {
		bytes, err := localeFiles.ReadFile(path.Join("locales", entry.Name()))
		if err != nil {
			t.Fatal(err)
		}
		var file localeFile
		if err := json.Unmarshal(bytes, &file); err != nil {
			t.Fatalf("%s: %v", entry.Name(), err)
		}
		if len(file.Messages) == 0 {
			t.Errorf("%s has no messages", entry.Name())
		}
		for key, value := range file.Messages {
			if placeholdersOf(key) != placeholdersOf(value) {
				t.Errorf("%s: %q keeps different placeholders: %q", entry.Name(), key, value)
			}
		}
	}
}

func TestLanguagesListsTheShippedTranslations(t *testing.T) {
	languages := Languages()
	for _, code := range []string{"de", "es", "fr", "pl"} {
		if !slices.Contains(languages, code) {
			t.Errorf("Languages() = %v, want %q in it", languages, code)
		}
	}
}

func TestForFallsBackToEnglish(t *testing.T) {
	for _, code := range []string{"", "en", "xx", "  "} {
		tr := For(code)
		if tr.Lang() != "en" {
			t.Errorf("For(%q).Lang() = %q, want en", code, tr.Lang())
		}
		if got := tr.T("Grand Total"); got != "Grand Total" {
			t.Errorf("For(%q).T(Grand Total) = %q", code, got)
		}
	}
	if English.T("{start} to {end}", "start", "a", "end", "b") != "a to b" {
		t.Error("English does not fill placeholders")
	}
}

func TestTranslatesAndFillsPlaceholders(t *testing.T) {
	de := For(" DE ")
	if de.Lang() != "de" {
		t.Fatalf("Lang() = %q", de.Lang())
	}
	if got := de.T("Grand Total"); got != "Gesamtsumme" {
		t.Errorf("T(Grand Total) = %q, want Gesamtsumme", got)
	}
	if got := de.T("{start} to {end}", "start", "2026-01-01", "end", "2026-01-31"); got != "2026-01-01 bis 2026-01-31" {
		t.Errorf("T({start} to {end}) = %q", got)
	}
	// A key the catalogue does not know reads as written.
	if got := de.T("Not a catalogue text"); got != "Not a catalogue text" {
		t.Errorf("unknown key = %q", got)
	}
}

// Data translates stored copy only when it is exactly a catalogue text, so a starter template reads in the language
// while what a person typed is left alone.
func TestDataTranslatesOnlyCatalogueTexts(t *testing.T) {
	fr := For("fr")
	if got := fr.Data("Monthly spending by category"); got != "Dépenses mensuelles par catégorie" {
		t.Errorf("Data(starter title) = %q", got)
	}
	if got := fr.Data("Our groceries"); got != "Our groceries" {
		t.Errorf("Data(typed title) = %q, want it unchanged", got)
	}
	if got := fr.Data(""); got != "" {
		t.Errorf("Data(\"\") = %q", got)
	}
}

func TestDateTimePerLanguage(t *testing.T) {
	moment := time.Date(2026, 10, 23, 14, 5, 0, 0, time.UTC)
	want := map[string]string{
		"en": "Oct 23, 2026, 2:05 PM",
		"pl": "23.10.2026, 14:05",
		"de": "23.10.2026, 14:05",
		"fr": "23/10/2026 14:05",
		"es": "23/10/2026, 14:05",
	}
	for code, expected := range want {
		if got := For(code).DateTime(moment); got != expected {
			t.Errorf("For(%q).DateTime = %q, want %q", code, got, expected)
		}
	}
}

func TestMarkIsIdentity(t *testing.T) {
	if Mark("Spent") != "Spent" {
		t.Error("Mark changed its argument")
	}
}
