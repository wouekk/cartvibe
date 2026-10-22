package render

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"cartvibe/api/internal/i18n"
	"cartvibe/api/internal/reporting"

	"github.com/xuri/excelize/v2"
)

// germanModel is a small grouped report with subtotals and a grand total, run for
// a German reader: the engine copies the translator onto the model like the
// currency hint, and the renderers read their own words from it.
func germanModel(t *testing.T) reporting.ReportModel {
	t.Helper()
	spec := reporting.ReportSpec{
		GroupBy: []reporting.FieldKey{"paid_by"},
		Detail:  reporting.DetailSpec{Mode: reporting.DetailAggregate, By: "category"},
		Columns: []reporting.Column{
			{Name: "Category", Label: "Kategorie", Kind: reporting.ColumnLabel, Field: "category"},
			{Name: "Total", Label: "Ausgegeben", Kind: reporting.ColumnAggregate, AggSrc: "SUM(amount)"},
		},
		Subtotals:   true,
		GrandTotals: true,
		NoneLabel:   "(Keine)",
	}
	rows := []reporting.Row{
		{"paid_by": {reporting.Str("Dana")}, "category": {reporting.Str("Food")}, "amount": {money("50")}},
	}
	meta := reporting.MetaInput{
		GeneratedAt: time.Date(2026, 7, 13, 9, 30, 0, 0, time.UTC),
		Translator:  i18n.For("de"),
	}
	model, err := reporting.Run(spec, paidByCatalog(t), rows, meta)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	return model
}

func TestCSV_WritesItsOwnWordsInTheReadersLanguage(t *testing.T) {
	got := mustCSV(t, germanModel(t), []Dimension{{Key: "paid_by", Label: "Hinzugefügt von"}})
	want := crlf(
		"Zeilentyp,Hinzugefügt von,Kategorie,Ausgegeben",
		"Detail,Dana,Food,50.00",
		"Zwischensumme,Dana,,50.00",
		"Gesamtsumme,,,50.00",
	)
	if got != want {
		t.Errorf("csv mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestXLSX_NamesTheSheetAndMarkersInTheReadersLanguage(t *testing.T) {
	out, err := XLSX(germanModel(t), []Dimension{{Key: "paid_by", Label: "Hinzugefügt von"}})
	if err != nil {
		t.Fatal(err)
	}
	file, err := excelize.OpenReader(bytes.NewReader(out))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	if name := file.GetSheetName(0); name != "Bericht" {
		t.Fatalf("sheet name = %q, want Bericht", name)
	}
	rows, err := file.GetRows("Bericht")
	if err != nil {
		t.Fatal(err)
	}
	joined := make([]string, len(rows))
	for index, row := range rows {
		joined[index] = strings.Join(row, "|")
	}
	text := strings.Join(joined, "\n")
	if !strings.Contains(text, "Summe") || !strings.Contains(text, "Gesamtsumme") {
		t.Errorf("markers not in German:\n%s", text)
	}
}

func TestHTML_LanguageTitleAndFooterFollowTheReader(t *testing.T) {
	model := germanModel(t)
	out, err := HTML(model, []Dimension{{Key: "paid_by", Label: "Hinzugefügt von"}}, DocumentChrome{})
	if err != nil {
		t.Fatal(err)
	}
	html := string(out)
	for _, want := range []string{`<html lang="de">`, "<title>Bericht</title>", "Erstellt am 2026-07-13 09:30:00 UTC", "Gesamtsumme"} {
		if !strings.Contains(html, want) {
			t.Errorf("HTML lacks %q", want)
		}
	}
}

// Without a translator the renderers keep their English words exactly, so every
// report rendered before languages existed is unchanged.
func TestHTML_ZeroTranslatorIsEnglish(t *testing.T) {
	model := germanModel(t)
	model.Meta.Translator = i18n.Translator{}
	out, err := HTML(model, []Dimension{{Key: "paid_by", Label: "Paid By"}}, DocumentChrome{})
	if err != nil {
		t.Fatal(err)
	}
	html := string(out)
	for _, want := range []string{`<html lang="en">`, "<title>Report</title>", "Generated 2026-07-13 09:30:00 UTC", "Grand Total"} {
		if !strings.Contains(html, want) {
			t.Errorf("HTML lacks %q", want)
		}
	}
}
