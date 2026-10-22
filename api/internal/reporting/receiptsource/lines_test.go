package receiptsource

import (
	"testing"

	"cartvibe/api/internal/i18n"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/reporting"

	"github.com/shopspring/decimal"
)

func boolPointer(value bool) *bool { return &value }

// texts reads a field's values as strings, in order.
func texts(row reporting.Row, key reporting.FieldKey) []string {
	values := row.Get(key)
	out := make([]string, 0, len(values))
	for _, value := range values {
		text, _ := value.Text()
		out = append(out, text)
	}
	return out
}

func amountOf(t *testing.T, row reporting.Row) decimal.Decimal {
	t.Helper()
	number, isNumber := row.Measure(KeyAmount).Decimal()
	if !isNumber {
		t.Fatalf("amount is %v, not a number", row.Measure(KeyAmount))
	}
	return number
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for index := range a {
		if a[index] != b[index] {
			return false
		}
	}
	return true
}

// Not cutting by a line field: one row per receipt, its line fields the distinct
// values of its lines, sorted.
func TestRowsWithLines_LabelsWithoutCutting(t *testing.T) {
	receipts := []models.Receipt{{Amount: dec("10.00")}}
	lines := [][]Line{{
		{Amount: dec("4.00"), Category: "Sweets", Tags: []string{"Kids", "Treat"}, Health: models.HEALTH_UNHEALTHY, Planned: boolPointer(false)},
		{Amount: dec("6.00"), Category: "Dairy", Tags: []string{"Kids"}, Health: models.HEALTH_HEALTHY},
	}}

	rows, perReceipt := mustNew(t).RowsWithLines(receipts, lines, LineDimensions{})

	if len(rows) != 1 || perReceipt[0] != 1 {
		t.Fatalf("got %d rows (%v per receipt), want 1", len(rows), perReceipt)
	}
	row := rows[0]
	if !amountOf(t, row).Equal(dec("10.00")) {
		t.Errorf("amount = %s, want 10.00", amountOf(t, row))
	}
	checks := []struct {
		key  reporting.FieldKey
		want []string
	}{
		{KeyCategory, []string{"Dairy", "Sweets"}},
		{KeyTag, []string{"Kids", "Treat"}},
		{KeyHealth, []string{"Healthy", "Unhealthy"}},
		{KeyPlanned, []string{"Planned", "Unplanned"}},
	}
	for _, check := range checks {
		if got := texts(row, check.key); !equalStrings(got, check.want) {
			t.Errorf("%s = %v, want %v", check.key, got, check.want)
		}
	}
}

// Cutting by category: a row per category carrying its lines' cost, and one more
// for what the lines leave over.
func TestRowsWithLines_CutsByCategoryWithTheRestAsNone(t *testing.T) {
	receipts := []models.Receipt{{Amount: dec("12.00")}}
	lines := [][]Line{{
		{Amount: dec("3.00"), Category: "Dairy"},
		{Amount: dec("4.00"), Category: "Sweets"},
		{Amount: dec("2.00"), Category: "Dairy"},
	}}

	rows, perReceipt := mustNew(t).RowsWithLines(receipts, lines, LineDimensions{Category: true})

	if perReceipt[0] != 3 || len(rows) != 3 {
		t.Fatalf("got %d rows (%v per receipt), want 3", len(rows), perReceipt)
	}
	want := []struct {
		category string
		amount   string
	}{
		{"Dairy", "5.00"},
		{"Sweets", "4.00"},
		{"", "3.00"},
	}
	for index, expected := range want {
		got := texts(rows[index], KeyCategory)
		if expected.category == "" {
			if len(got) != 0 {
				t.Errorf("row %d category = %v, want none", index, got)
			}
		} else if !equalStrings(got, []string{expected.category}) {
			t.Errorf("row %d category = %v, want %s", index, got, expected.category)
		}
		if !amountOf(t, rows[index]).Equal(dec(expected.amount)) {
			t.Errorf("row %d amount = %s, want %s", index, amountOf(t, rows[index]), expected.amount)
		}
	}
}

// A receipt without lines is one row with its whole amount and no category.
func TestRowsWithLines_ReceiptWithoutLinesIsOneNoneRow(t *testing.T) {
	receipts := []models.Receipt{{Amount: dec("8.50")}, {Amount: dec("2.00")}}
	lines := [][]Line{nil} // shorter than receipts on purpose

	rows, perReceipt := mustNew(t).RowsWithLines(receipts, lines, LineDimensions{Category: true, Health: true})

	if len(rows) != 2 || perReceipt[0] != 1 || perReceipt[1] != 1 {
		t.Fatalf("got %d rows (%v per receipt), want one each", len(rows), perReceipt)
	}
	for index, want := range []string{"8.50", "2.00"} {
		if !amountOf(t, rows[index]).Equal(dec(want)) {
			t.Errorf("row %d amount = %s, want %s", index, amountOf(t, rows[index]), want)
		}
		if len(rows[index].Get(KeyCategory)) != 0 || len(rows[index].Get(KeyHealth)) != 0 {
			t.Errorf("row %d carries line values", index)
		}
	}
}

// Lines covering the receipt exactly leave no rest row.
func TestRowsWithLines_NoRestRowWhenLinesCoverTheReceipt(t *testing.T) {
	receipts := []models.Receipt{{Amount: dec("5.00")}}
	lines := [][]Line{{{Amount: dec("5.00"), Category: "Dairy"}}}

	rows, _ := mustNew(t).RowsWithLines(receipts, lines, LineDimensions{Category: true})

	if len(rows) != 1 {
		t.Fatalf("got %d rows, want 1", len(rows))
	}
}

// Lines adding up to more than the receipt are scaled to it, to the cent, so the
// report's total is still what was spent.
func TestRowsWithLines_LinesOverTheReceiptAreScaledDown(t *testing.T) {
	receipts := []models.Receipt{{Amount: dec("10.00")}}
	lines := [][]Line{{
		{Amount: dec("7.00"), Category: "A"},
		{Amount: dec("7.00"), Category: "B"},
		{Amount: dec("7.00"), Category: "C"},
	}}

	rows, _ := mustNew(t).RowsWithLines(receipts, lines, LineDimensions{Category: true})

	if len(rows) != 3 {
		t.Fatalf("got %d rows, want 3 (no rest row)", len(rows))
	}
	want := []string{"3.34", "3.33", "3.33"}
	total := decimal.Zero
	for index, expected := range want {
		amount := amountOf(t, rows[index])
		total = total.Add(amount)
		if !amount.Equal(dec(expected)) {
			t.Errorf("row %d amount = %s, want %s", index, amount, expected)
		}
	}
	if !total.Equal(dec("10.00")) {
		t.Errorf("shares add up to %s, want 10.00", total)
	}
}

// A refund's lines are negative too; the rest keeps the sign.
func TestRowsWithLines_RefundKeepsItsSign(t *testing.T) {
	receipts := []models.Receipt{{Amount: dec("-10.00")}}
	lines := [][]Line{{{Amount: dec("-4.00"), Category: "Dairy"}}}

	rows, _ := mustNew(t).RowsWithLines(receipts, lines, LineDimensions{Category: true})

	if len(rows) != 2 {
		t.Fatalf("got %d rows, want 2", len(rows))
	}
	if !amountOf(t, rows[0]).Equal(dec("-4.00")) || !amountOf(t, rows[1]).Equal(dec("-6.00")) {
		t.Errorf("amounts = %s, %s; want -4.00, -6.00", amountOf(t, rows[0]), amountOf(t, rows[1]))
	}
}

// A line with two tags counts toward both, as the Dashboard's tag tiles do; a
// line with no tag goes to the none bucket of the tag cut.
func TestRowsWithLines_TagsFanOut(t *testing.T) {
	receipts := []models.Receipt{{Amount: dec("8.00")}}
	lines := [][]Line{{
		{Amount: dec("5.00"), Tags: []string{"Kids", "Treat", "Kids"}},
		{Amount: dec("3.00")},
	}}

	rows, _ := mustNew(t).RowsWithLines(receipts, lines, LineDimensions{Tag: true})

	if len(rows) != 3 {
		t.Fatalf("got %d rows, want 3", len(rows))
	}
	want := []struct {
		tag    string
		amount string
	}{{"Kids", "5.00"}, {"Treat", "5.00"}, {"", "3.00"}}
	for index, expected := range want {
		got := texts(rows[index], KeyTag)
		if expected.tag == "" && len(got) != 0 || expected.tag != "" && !equalStrings(got, []string{expected.tag}) {
			t.Errorf("row %d tag = %v, want %q", index, got, expected.tag)
		}
		if !amountOf(t, rows[index]).Equal(dec(expected.amount)) {
			t.Errorf("row %d amount = %s, want %s", index, amountOf(t, rows[index]), expected.amount)
		}
	}
}

// A field the report does not cut by labels each row with only the lines in it.
func TestRowsWithLines_UncutFieldsLabelOnlyTheirLines(t *testing.T) {
	receipts := []models.Receipt{{Amount: dec("9.00")}}
	lines := [][]Line{{
		{Amount: dec("4.00"), Category: "Sweets", Health: models.HEALTH_UNHEALTHY},
		{Amount: dec("5.00"), Category: "Dairy", Health: models.HEALTH_HEALTHY},
	}}

	rows, _ := mustNew(t).RowsWithLines(receipts, lines, LineDimensions{Category: true})

	if got := texts(rows[0], KeyHealth); !equalStrings(got, []string{"Unhealthy"}) {
		t.Errorf("Sweets row health = %v, want [Unhealthy]", got)
	}
	if got := texts(rows[1], KeyHealth); !equalStrings(got, []string{"Healthy"}) {
		t.Errorf("Dairy row health = %v, want [Healthy]", got)
	}
}

// Health and planned cut together: one row per combination.
func TestRowsWithLines_CutsByHealthAndPlanned(t *testing.T) {
	receipts := []models.Receipt{{Amount: dec("6.00")}}
	lines := [][]Line{{
		{Amount: dec("1.00"), Health: models.HEALTH_UNHEALTHY, Planned: boolPointer(false)},
		{Amount: dec("2.00"), Health: models.HEALTH_UNHEALTHY},
		{Amount: dec("3.00"), Health: models.HEALTH_UNKNOWN, Planned: boolPointer(true)},
	}}

	rows, _ := mustNew(t).RowsWithLines(receipts, lines, LineDimensions{Health: true, Planned: true})

	if len(rows) != 3 {
		t.Fatalf("got %d rows, want 3", len(rows))
	}
	if !equalStrings(texts(rows[0], KeyHealth), []string{"Unhealthy"}) || !equalStrings(texts(rows[0], KeyPlanned), []string{"Unplanned"}) {
		t.Errorf("row 0 = %v / %v", texts(rows[0], KeyHealth), texts(rows[0], KeyPlanned))
	}
	if !equalStrings(texts(rows[1], KeyPlanned), []string{"Planned"}) {
		t.Errorf("row 1 planned = %v, want [Planned]", texts(rows[1], KeyPlanned))
	}
	// UNKNOWN is no rating, so that line is in the none bucket of the health cut.
	if len(rows[2].Get(KeyHealth)) != 0 {
		t.Errorf("row 2 health = %v, want none", texts(rows[2], KeyHealth))
	}
}

func TestHealthAndPlannedLabels(t *testing.T) {
	health := map[string]string{
		models.HEALTH_HEALTHY:   "Healthy",
		models.HEALTH_MEDIUM:    "Medium",
		models.HEALTH_UNHEALTHY: "Unhealthy",
		models.HEALTH_NOT_FOOD:  "Not food",
		models.HEALTH_UNKNOWN:   "",
		"":                      "",
		"healthy":               "Healthy",
	}
	for stored, want := range health {
		if got := HealthLabel(stored, i18n.English); got != want {
			t.Errorf("HealthLabel(%q) = %q, want %q", stored, got, want)
		}
	}

	if PlannedLabel(nil, i18n.English) != "Planned" || PlannedLabel(boolPointer(true), i18n.English) != "Planned" || PlannedLabel(boolPointer(false), i18n.English) != "Unplanned" {
		t.Errorf("PlannedLabel: nil and true are Planned, false is Unplanned")
	}
}

func TestLineDimensionsFor(t *testing.T) {
	dimensions := LineDimensionsFor([]string{"paid_by", "tag", "health", "date_month"})
	if dimensions != (LineDimensions{Tag: true, Health: true}) {
		t.Errorf("LineDimensionsFor = %+v", dimensions)
	}
	if LineDimensionsFor([]string{"shop"}).Active() {
		t.Errorf("a report cutting by shop cuts by no line field")
	}
	for _, key := range []reporting.FieldKey{KeyCategory, KeyTag, KeyHealth, KeyPlanned} {
		if !IsLineField(key) {
			t.Errorf("IsLineField(%s) = false", key)
		}
	}
	if IsLineField(KeyShop) {
		t.Errorf("shop is not a line field")
	}
}

func TestAllocateProportionally(t *testing.T) {
	tests := []struct {
		name    string
		total   string
		weights []string
		want    []string
	}{
		{"even", "10.00", []string{"6", "6"}, []string{"5.00", "5.00"}},
		{"leftover cent to the earliest of equals", "10.00", []string{"7", "7", "7"}, []string{"3.34", "3.33", "3.33"}},
		{"leftover cent to the largest remainder", "1.00", []string{"1", "2"}, []string{"0.33", "0.67"}},
		{"negative total", "-10.00", []string{"7", "7", "7"}, []string{"-3.34", "-3.33", "-3.33"}},
		{"keeps finer places", "1.005", []string{"1", "1"}, []string{"0.503", "0.502"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			weights := make([]decimal.Decimal, len(test.weights))
			sum := decimal.Zero
			for index, weight := range test.weights {
				weights[index] = dec(weight)
				sum = sum.Add(weights[index])
			}
			got := allocateProportionally(dec(test.total), weights, sum)
			total := decimal.Zero
			for index, share := range got {
				total = total.Add(share)
				if !share.Equal(dec(test.want[index])) {
					t.Errorf("share %d = %s, want %s", index, share, test.want[index])
				}
			}
			if !total.Equal(dec(test.total)) {
				t.Errorf("shares add up to %s, want %s", total, test.total)
			}
		})
	}
}

// Through the engine: a category report's grand total is what was spent, the
// rest shows as (None), and COUNT still counts each receipt once per bucket.
func TestRowsWithLines_FeedTheEngine(t *testing.T) {
	source := mustNew(t)
	receipts := []models.Receipt{{Amount: dec("10.00")}, {Amount: dec("5.00")}}
	lines := [][]Line{
		{{Amount: dec("4.00"), Category: "Dairy"}, {Amount: dec("4.00"), Category: "Dairy"}},
		{{Amount: dec("5.00"), Category: "Dairy"}},
	}

	spec := reporting.ReportSpec{
		GroupBy: []reporting.FieldKey{KeyCategory},
		Columns: []reporting.Column{
			{Name: "Count", Kind: reporting.ColumnAggregate, AggSrc: "COUNT()"},
			{Name: "Total", Kind: reporting.ColumnAggregate, AggSrc: "SUM(amount)"},
		},
		Subtotals:   true,
		GrandTotals: true,
	}

	rows, _ := source.RowsWithLines(receipts, lines, LineDimensions{Category: true})
	model, err := reporting.Run(spec, source.Catalog(), rows, reporting.MetaInput{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	if len(model.Root.Children) != 2 {
		t.Fatalf("got %d buckets, want Dairy and (None)", len(model.Root.Children))
	}
	dairy, none := model.Root.Children[0], model.Root.Children[1]
	if !none.IsNone {
		t.Errorf("the second bucket is %v, want (None)", none.Value)
	}
	cell := func(cells []reporting.Cell, column string) string {
		for _, candidate := range cells {
			if candidate.Column == column {
				return candidate.Value().String()
			}
		}
		t.Fatalf("no %s cell", column)
		return ""
	}
	if cell(dairy.Subtotals, "Total") != "13" || cell(dairy.Subtotals, "Count") != "2" {
		t.Errorf("Dairy = %s over %s receipts, want 13 over 2", cell(dairy.Subtotals, "Total"), cell(dairy.Subtotals, "Count"))
	}
	if cell(none.Subtotals, "Total") != "2" {
		t.Errorf("(None) = %s, want 2", cell(none.Subtotals, "Total"))
	}
	if cell(model.GrandTotals, "Total") != "15" {
		t.Errorf("grand total = %s, want 15", cell(model.GrandTotals, "Total"))
	}
}

// A source built for a German reader names its fields and the words a value is
// made of (status, health, planned) in German, so the buckets a report groups by
// read in that language. The catalogue keys stay the same.
func TestNew_TranslatesLabelsAndValuesForTheReader(t *testing.T) {
	source, err := New(nil, i18n.For("de"))
	if err != nil {
		t.Fatal(err)
	}

	labels := map[reporting.FieldKey]string{
		KeyShop:      "Laden",
		KeyAmount:    "Betrag",
		KeyStatus:    "Status",
		KeyPaidBy:    "Hinzugefügt von",
		KeyDateMonth: "Datum (Monat)",
		KeyPlanned:   "Geplant",
	}
	for key, want := range labels {
		field, found := source.Catalog().Get(key)
		if !found || field.Label != want {
			t.Errorf("label of %s = %q, want %q", key, field.Label, want)
		}
	}

	receipts := []models.Receipt{{Amount: dec("3.00"), Status: models.OPEN}}
	lines := [][]Line{{
		{Amount: dec("1.00"), Health: models.HEALTH_HEALTHY, Planned: boolPointer(false)},
		{Amount: dec("2.00"), Health: models.HEALTH_NOT_FOOD},
	}}
	rows, _ := source.RowsWithLines(receipts, lines, LineDimensions{})

	if got := texts(rows[0], KeyStatus); !equalStrings(got, []string{"Zu prüfen"}) {
		t.Errorf("status = %v, want [Zu prüfen]", got)
	}
	if got := texts(rows[0], KeyHealth); !equalStrings(got, []string{"Gesund", "Kein Lebensmittel"}) {
		t.Errorf("health = %v", got)
	}
	if got := texts(rows[0], KeyPlanned); !equalStrings(got, []string{"Geplant", "Ungeplant"}) {
		t.Errorf("planned = %v", got)
	}
}
