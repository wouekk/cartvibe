// Package i18n translates the few texts the API writes into documents a person reads, such as a generated report.
//
// The English text is the key, exactly as in the desktop (desktop/src/assets/i18n). The translations are not kept
// here by hand: `npm run i18n:extract` reads every T("...") and Mark("...") literal in the Go code into the desktop
// catalogue, where each language is translated once, and writes the subset the API needs to locales/<code>.json.
// `npm run i18n:check` fails when those files are stale. A text without a translation reads in English, so a missing
// file or key never breaks a report.
//
// The package is pure (no settings, no database), so the reporting engine and its renderers may import it.
package i18n

import (
	"embed"
	"encoding/json"
	"path"
	"sort"
	"strings"
	"time"
)

//go:embed locales/*.json
var localeFiles embed.FS

// English is the catalogue language: every text reads as written. The zero Translator is English too.
var English = Translator{}

// Translator translates the English texts of one language.
type Translator struct {
	lang     string
	messages map[string]string
}

type localeFile struct {
	Messages map[string]string `json:"messages"`
}

var locales = loadLocales()

func loadLocales() map[string]map[string]string {
	loaded := map[string]map[string]string{}
	entries, err := localeFiles.ReadDir("locales")
	if err != nil {
		return loaded
	}
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".json") {
			continue
		}
		bytes, err := localeFiles.ReadFile(path.Join("locales", name))
		if err != nil {
			continue
		}
		var file localeFile
		// A broken file leaves its language in English rather than failing the API at start (the tests catch it).
		if json.Unmarshal(bytes, &file) == nil {
			loaded[strings.TrimSuffix(name, ".json")] = file.Messages
		}
	}
	return loaded
}

// For returns the translator of a language code as the desktop stores it in UserPreferences.language ("de", "pl").
// An empty or unknown code is English.
func For(code string) Translator {
	code = strings.ToLower(strings.TrimSpace(code))
	messages, ok := locales[code]
	if !ok {
		return English
	}
	return Translator{lang: code, messages: messages}
}

// Languages lists the codes with a translation file, sorted.
func Languages() []string {
	codes := make([]string, 0, len(locales))
	for code := range locales {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return codes
}

// Lang is the language code, "en" for English.
func (t Translator) Lang() string {
	if t.lang == "" {
		return "en"
	}
	return t.lang
}

// T translates key and fills its {placeholders} from params, given as name, value pairs:
// T("{start} to {end}", "start", from, "end", to). The key must be a string literal, so the extractor can read it.
func (t Translator) T(key string, params ...string) string {
	return fill(t.lookup(key), params)
}

// Data translates a text that came from stored data, such as the title of a starter report: a text that is exactly a
// catalogue key reads in the language, anything else (what a person typed) is returned as written.
func (t Translator) Data(text string) string {
	return t.lookup(text)
}

func (t Translator) lookup(key string) string {
	if translated, ok := t.messages[key]; ok && translated != "" {
		return translated
	}
	return key
}

func fill(text string, params []string) string {
	for index := 0; index+1 < len(params); index += 2 {
		text = strings.ReplaceAll(text, "{"+params[index]+"}", params[index+1])
	}
	return text
}

// dateTimeLayouts is how a date and time read in a sentence. Languages other than English are numeric on purpose:
// a month name would need its grammatical case in Polish.
var dateTimeLayouts = map[string]string{
	"en": "Jan 2, 2006, 3:04 PM",
	"pl": "02.01.2006, 15:04",
	"de": "02.01.2006, 15:04",
	"fr": "02/01/2006 15:04",
	"es": "02/01/2006, 15:04",
}

// DateTime is a moment as the language writes it, in the moment's own zone.
func (t Translator) DateTime(moment time.Time) string {
	layout, ok := dateTimeLayouts[t.Lang()]
	if !ok {
		layout = "2006-01-02 15:04"
	}
	return moment.Format(layout)
}

// dayLayouts is how a calendar day reads in a sentence ("Warranty ends 12 March"); the year is added only when it
// is not the current one. Numeric outside English, for the same reason as dateTimeLayouts.
var dayLayouts = map[string][2]string{
	"en": {"2 January", "2 January 2006"},
	"pl": {"02.01.2006", "02.01.2006"},
	"de": {"02.01.2006", "02.01.2006"},
	"fr": {"02/01/2006", "02/01/2006"},
	"es": {"02/01/2006", "02/01/2006"},
}

// Day is a calendar day as the language writes it; withYear adds the year where the short form leaves it out.
func (t Translator) Day(day time.Time, withYear bool) string {
	layouts, ok := dayLayouts[t.Lang()]
	if !ok {
		return day.Format(time.DateOnly)
	}
	if withYear {
		return day.Format(layouts[1])
	}
	return day.Format(layouts[0])
}

// Mark returns key unchanged. It marks an English text defined as a value (a stored template title, a label kept in
// a table) so the extractor puts it in the catalogue; it is translated later where it is shown, with T or Data.
func Mark(key string) string {
	return key
}
