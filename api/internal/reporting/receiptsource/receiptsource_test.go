package receiptsource

import (
	"math"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/reporting"

	"github.com/shopspring/decimal"
)

func dec(literal string) decimal.Decimal {
	return decimal.RequireFromString(literal)
}

func mustNew(t *testing.T) Source {
	t.Helper()

	source, err := New(time.UTC)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	return source
}

func TestSource_CatalogBuiltins(t *testing.T) {
	catalog := mustNew(t).Catalog()

	tests := []struct {
		key      reporting.FieldKey
		dataType reporting.DataType
		multi    bool
	}{
		{KeyReceiptID, reporting.TypeNumber, false},
		{KeyName, reporting.TypeString, false},
		{KeyShop, reporting.TypeString, false},
		{KeyAmount, reporting.TypeCurrency, false},
		{KeyDate, reporting.TypeDate, false},
		{KeyResolvedDate, reporting.TypeDate, false},
		{KeyCreatedAt, reporting.TypeDate, false},
		{KeyStatus, reporting.TypeString, false},
		{KeyPaidBy, reporting.TypeString, false},
		{KeyGroup, reporting.TypeString, false},
		{KeyCategory, reporting.TypeString, true},
		{KeyTag, reporting.TypeString, true},
	}

	for _, test := range tests {
		t.Run(string(test.key), func(t *testing.T) {
			field, exists := catalog.Get(test.key)
			if !exists {
				t.Fatalf("catalog is missing %s", test.key)
			}
			if field.DataType != test.dataType {
				t.Errorf("dataType = %v, want %v", field.DataType, test.dataType)
			}
			if field.Multi != test.multi {
				t.Errorf("multi = %v, want %v", field.Multi, test.multi)
			}
		})
	}
}

func TestSource_CatalogHasDatePeriodFields(t *testing.T) {
	catalog := mustNew(t).Catalog()

	keys := []reporting.FieldKey{
		KeyDateDay, KeyDateMonth, KeyDateYear,
		KeyResolvedDateDay, KeyResolvedDateMonth, KeyResolvedDateYear,
		KeyCreatedAtDay, KeyCreatedAtMonth, KeyCreatedAtYear,
	}
	for _, key := range keys {
		t.Run(string(key), func(t *testing.T) {
			field, exists := catalog.Get(key)
			if !exists {
				t.Fatalf("catalog is missing %s", key)
			}
			// String so the engine buckets on the exact label, and a dimension so a
			// report may group by it.
			if field.DataType != reporting.TypeString {
				t.Errorf("dataType = %v, want %v", field.DataType, reporting.TypeString)
			}
			if field.Multi {
				t.Errorf("%s is single-valued", key)
			}
			if field.Role() != reporting.RoleDimension {
				t.Errorf("role = %v, want dimension", field.Role())
			}
		})
	}
}

func TestSource_DerivesDatePeriodFields(t *testing.T) {
	row := mustNew(t).Rows([]models.Receipt{fullReceipt()})[0]

	tests := []struct {
		key  reporting.FieldKey
		want string
	}{
		// date = 2026-05-15
		{KeyDateDay, "2026-05-15"},
		{KeyDateMonth, "2026-05"},
		{KeyDateYear, "2026"},
		// resolved_date = 2026-05-20
		{KeyResolvedDateDay, "2026-05-20"},
		{KeyResolvedDateMonth, "2026-05"},
		{KeyResolvedDateYear, "2026"},
		// created_at = 2026-05-01T08:00Z
		{KeyCreatedAtDay, "2026-05-01"},
		{KeyCreatedAtMonth, "2026-05"},
		{KeyCreatedAtYear, "2026"},
	}
	for _, test := range tests {
		t.Run(string(test.key), func(t *testing.T) {
			text, isText := row.Measure(test.key).Text()
			if !isText || text != test.want {
				t.Errorf("%s = %v, want %q", test.key, row.Measure(test.key), test.want)
			}
		})
	}
}

// A nil resolved date emits none of the resolved_date period fields, so it lands
// in the (None) bucket just like the raw resolved_date field.
func TestSource_NilResolvedDateOmitsResolvedPeriodFields(t *testing.T) {
	receipt := fullReceipt()
	receipt.ResolvedDate = nil

	row := mustNew(t).Rows([]models.Receipt{receipt})[0]

	for _, key := range []reporting.FieldKey{KeyResolvedDate, KeyResolvedDateDay, KeyResolvedDateMonth, KeyResolvedDateYear} {
		if values := row.Get(key); len(values) != 0 {
			t.Errorf("%s = %v, want no value", key, values)
		}
	}
}

// The period fields are derived in an explicit zone, never the value's own
// location: a receipt Date in UTC always, and an instant in the source's app
// zone — UTC here. So a value loaded with a -05:00 offset near midnight is
// bucketed by its UTC calendar day, not the offset it happened to carry.
// TestSource_InstantPeriodFieldsUseTheAppZone covers a non-UTC app zone.
func TestSource_DatePeriodFieldsTruncateInUTC(t *testing.T) {
	minus5 := time.FixedZone("minus5", -5*60*60)
	receipt := fullReceipt()
	// 2026-05-31 23:30 -05:00 is 2026-06-01 04:30 UTC -> crosses into June.
	receipt.Date = time.Date(2026, 5, 31, 23, 30, 0, 0, minus5)
	// 2026-12-31 20:00 -05:00 is 2027-01-01 01:00 UTC -> crosses into 2027.
	resolved := time.Date(2026, 12, 31, 20, 0, 0, 0, minus5)
	receipt.ResolvedDate = &resolved

	row := mustNew(t).Rows([]models.Receipt{receipt})[0]

	tests := []struct {
		key  reporting.FieldKey
		want string
	}{
		{KeyDateDay, "2026-06-01"},
		{KeyDateMonth, "2026-06"},
		{KeyDateYear, "2026"},
		{KeyResolvedDateDay, "2027-01-01"},
		{KeyResolvedDateMonth, "2027-01"},
		{KeyResolvedDateYear, "2027"},
	}
	for _, test := range tests {
		t.Run(string(test.key), func(t *testing.T) {
			text, isText := row.Measure(test.key).Text()
			if !isText || text != test.want {
				t.Errorf("%s = %v, want %q (UTC)", test.key, row.Measure(test.key), test.want)
			}
		})
	}
}

// Grouping by date_month buckets receipts into calendar months: same-month
// receipts merge into one bucket, and the buckets sort chronologically because
// zero-padded ISO strings compare that way.
func TestSource_GroupByMonthBucketsByCalendarMonth(t *testing.T) {
	source := mustNew(t)

	receipt := func(year int, month time.Month, day int, amount string) models.Receipt {
		return models.Receipt{
			Date:   time.Date(year, month, day, 0, 0, 0, 0, time.UTC),
			Amount: dec(amount),
		}
	}

	receipts := []models.Receipt{
		receipt(2026, time.May, 15, "100.00"),
		receipt(2026, time.May, 20, "50.00"), // same month as the first -> one bucket
		receipt(2026, time.March, 1, "30.00"),
		receipt(2026, time.December, 31, "20.00"),
		receipt(2027, time.January, 1, "10.00"),
	}

	spec := reporting.ReportSpec{
		GroupBy:     []reporting.FieldKey{KeyDateMonth},
		Columns:     []reporting.Column{{Name: "Total", Kind: reporting.ColumnAggregate, AggSrc: "SUM(amount)"}},
		Subtotals:   true,
		GrandTotals: true,
	}

	model, err := reporting.Run(spec, source.Catalog(), source.Rows(receipts), reporting.MetaInput{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	wantBuckets := []string{"2026-03", "2026-05", "2026-12", "2027-01"}
	if len(model.Root.Children) != len(wantBuckets) {
		t.Fatalf("got %d month buckets, want %d", len(model.Root.Children), len(wantBuckets))
	}
	for index, want := range wantBuckets {
		if got := model.Root.Children[index].Value.String(); got != want {
			t.Errorf("bucket %d = %s, want %s", index, got, want)
		}
	}

	find := func(cells []reporting.Cell, column string) string {
		for _, candidate := range cells {
			if candidate.Column == column {
				return candidate.Value().String()
			}
		}
		t.Fatalf("no cell for %s", column)
		return ""
	}
	// The two May receipts merged into one bucket that sums both.
	if got := find(model.Root.Children[1].Subtotals, "Total"); got != "150" {
		t.Errorf("May total = %s, want 150", got)
	}
}

func fullReceipt() models.Receipt {
	resolved := time.Date(2026, 5, 20, 0, 0, 0, 0, time.UTC)

	return models.Receipt{
		BaseModel:    models.BaseModel{ID: 7, CreatedAt: time.Date(2026, 5, 1, 8, 0, 0, 0, time.UTC)},
		Name:         "Staples",
		Amount:       dec("120.00"),
		Date:         time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC),
		ResolvedDate: &resolved,
		Status:       models.RESOLVED,
		PaidByUser:   models.User{DisplayName: "Dana"},
		Group:        models.Group{Name: "Household"},
		Categories:   []models.Category{{Name: "Clothing"}, {Name: "Medical"}},
		Tags:         []models.Tag{{Name: "Alex"}},
	}
}

func TestSource_RowsResolvesEveryField(t *testing.T) {
	rows := mustNew(t).Rows([]models.Receipt{fullReceipt()})
	if len(rows) != 1 {
		t.Fatalf("got %d rows, want 1", len(rows))
	}
	row := rows[0]

	t.Run("receipt id", func(t *testing.T) {
		number, isNumber := row.Measure(KeyReceiptID).Decimal()
		if !isNumber || !number.Equal(dec("7")) {
			t.Errorf("receipt_id = %v", row.Measure(KeyReceiptID))
		}
	})

	t.Run("amount", func(t *testing.T) {
		number, isNumber := row.Measure(KeyAmount).Decimal()
		if !isNumber || !number.Equal(dec("120.00")) {
			t.Errorf("amount = %v", row.Measure(KeyAmount))
		}
	})

	strings := []struct {
		key  reporting.FieldKey
		want string
	}{
		{KeyName, "Staples"},
		{KeyStatus, "RESOLVED"},
		{KeyPaidBy, "Dana"},
		{KeyGroup, "Household"},
		{KeyTag, "Alex"},
	}
	for _, test := range strings {
		t.Run(string(test.key), func(t *testing.T) {
			text, isText := row.Measure(test.key).Text()
			if !isText || text != test.want {
				t.Errorf("%s = %v, want %q", test.key, row.Measure(test.key), test.want)
			}
		})
	}

	dates := []struct {
		key  reporting.FieldKey
		want time.Time
	}{
		{KeyDate, time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)},
		{KeyResolvedDate, time.Date(2026, 5, 20, 0, 0, 0, 0, time.UTC)},
		{KeyCreatedAt, time.Date(2026, 5, 1, 8, 0, 0, 0, time.UTC)},
	}
	for _, test := range dates {
		t.Run(string(test.key), func(t *testing.T) {
			instant, isDate := row.Measure(test.key).Time()
			if !isDate || !instant.Equal(test.want) {
				t.Errorf("%s = %v, want %v", test.key, row.Measure(test.key), test.want)
			}
		})
	}

	// Categories are multi-valued, and keep the order the receipt carried them.
	t.Run("categories fan out", func(t *testing.T) {
		values := row.Get(KeyCategory)
		if len(values) != 2 {
			t.Fatalf("got %d categories, want 2", len(values))
		}
		first, _ := values[0].Text()
		second, _ := values[1].Text()
		if first != "Clothing" || second != "Medical" {
			t.Errorf("categories = %v, %v", first, second)
		}
	})
}

// A payer without a display name falls back to the name they log in with.
func TestSource_PaidByFallsBackToUsername(t *testing.T) {
	receipt := models.Receipt{PaidByUser: models.User{Username: "dana.smith"}}
	row := mustNew(t).Rows([]models.Receipt{receipt})[0]

	text, isText := row.Measure(KeyPaidBy).Text()
	if !isText || text != "dana.smith" {
		t.Errorf("paid_by = %v, want dana.smith", row.Measure(KeyPaidBy))
	}
}

// An association the caller did not preload resolves to no value, which the
// engine reports as (None) rather than as an error.
func TestSource_UnloadedAssociationsBecomeNone(t *testing.T) {
	row := mustNew(t).Rows([]models.Receipt{{Name: "Bare", Amount: dec("1.00")}})[0]

	absent := []reporting.FieldKey{KeyPaidBy, KeyGroup, KeyResolvedDate, KeyCategory, KeyTag}
	for _, key := range absent {
		t.Run(string(key), func(t *testing.T) {
			if len(row.Get(key)) != 0 {
				t.Errorf("%s resolved to %v, want no value", key, row.Get(key))
			}
			if !row.Measure(key).IsNull() {
				t.Errorf("%s measures as %v, want null", key, row.Measure(key))
			}
		})
	}
}

func TestSource_RowsPreservesOrder(t *testing.T) {
	receipts := []models.Receipt{
		{BaseModel: models.BaseModel{ID: 3}},
		{BaseModel: models.BaseModel{ID: 1}},
		{BaseModel: models.BaseModel{ID: 2}},
	}

	rows := mustNew(t).Rows(receipts)

	want := []string{"3", "1", "2"}
	for index, expected := range want {
		number, _ := rows[index].Measure(KeyReceiptID).Decimal()
		if number.String() != expected {
			t.Errorf("row %d receipt_id = %s, want %s", index, number, expected)
		}
	}
}

func TestSource_RowsOnNoReceipts(t *testing.T) {
	if rows := mustNew(t).Rows(nil); len(rows) != 0 {
		t.Errorf("Rows(nil) = %v, want empty", rows)
	}
}

// The end-to-end shape: real receipts through the source into the engine,
// reproducing the design document's worked example.
func TestSource_FeedsTheEngine(t *testing.T) {
	source := mustNew(t)

	receipt := func(payer, tag, category, amount string) models.Receipt {
		built := models.Receipt{
			Amount:     dec(amount),
			PaidByUser: models.User{DisplayName: payer},
			Tags:       []models.Tag{{Name: tag}},
			Categories: []models.Category{{Name: category}},
		}
		return built
	}

	receipts := []models.Receipt{
		receipt("Dana", "Alex", "Clothing", "30.00"),
		receipt("Dana", "Alex", "Clothing", "30.00"),
		receipt("Dana", "Alex", "Clothing", "30.00"),
		receipt("Dana", "Alex", "Clothing", "30.00"),
		receipt("Dana", "Alex", "Medical", "50.00"),
		receipt("Dana", "Alex", "Medical", "30.00"),
		receipt("Dana", "Sam", "Clothing", "30.00"),
		receipt("Dana", "Sam", "Clothing", "30.00"),
		receipt("Dana", "Sam", "Clothing", "30.00"),
		receipt("Dana", "Sam", "Mileage", "30.00"),
	}

	spec := reporting.ReportSpec{
		GroupBy: []reporting.FieldKey{KeyPaidBy, KeyTag},
		Detail:  reporting.DetailSpec{Mode: reporting.DetailAggregate, By: KeyCategory},
		Columns: []reporting.Column{
			{Name: "Category", Kind: reporting.ColumnLabel, Field: KeyCategory},
			{Name: "Count", Kind: reporting.ColumnAggregate, AggSrc: "COUNT()"},
			{Name: "Subtotal", Kind: reporting.ColumnAggregate, AggSrc: "SUM(amount)"},
			{Name: "AvgPerReceipt", Label: "Avg/Receipt", Kind: reporting.ColumnArithmetic, Expr: "ROUND(Subtotal / Count, 2)"},
		},
		Subtotals:   true,
		GrandTotals: true,
	}

	model, err := reporting.Run(spec, source.Catalog(), source.Rows(receipts), reporting.MetaInput{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	find := func(cells []reporting.Cell, column string) string {
		for _, candidate := range cells {
			if candidate.Column == column {
				return candidate.Value().String()
			}
		}
		t.Fatalf("no cell for %s", column)
		return ""
	}

	dana := model.Root.Children[0]
	alex, sam := dana.Children[0], dana.Children[1]

	if got := find(alex.Subtotals, "Subtotal"); got != "200" {
		t.Errorf("Alex subtotal = %s, want 200", got)
	}
	if got := find(alex.Subtotals, "AvgPerReceipt"); got != "33.33" {
		t.Errorf("Alex average = %s, want 33.33", got)
	}
	if got := find(sam.Subtotals, "AvgPerReceipt"); got != "30" {
		t.Errorf("Sam average = %s, want 30", got)
	}
	if got := find(model.GrandTotals, "Subtotal"); got != "320" {
		t.Errorf("grand total = %s, want 320", got)
	}
	if got := find(model.GrandTotals, "AvgPerReceipt"); got != "32" {
		t.Errorf("grand average = %s, want 32", got)
	}

}

// A receipt that never round-tripped through the database holds the zero time.
// Grouping on it must be stable, which it was not while date buckets were keyed
// on UnixNano: the zero time and an instant in 585 shared a key.
func TestSource_ZeroCreatedAtGroupsStably(t *testing.T) {
	source := mustNew(t)

	// The zero time, and the instant exactly 2^64 nanoseconds later.
	zero := time.Time{}
	wrapped := zero.Add(math.MaxInt64).Add(math.MaxInt64).Add(2)

	receipts := []models.Receipt{
		{BaseModel: models.BaseModel{ID: 1, CreatedAt: zero}, Amount: dec("1.00")},
		{BaseModel: models.BaseModel{ID: 2, CreatedAt: wrapped}, Amount: dec("2.00")},
	}

	spec := reporting.ReportSpec{
		GroupBy:     []reporting.FieldKey{KeyCreatedAt},
		Columns:     []reporting.Column{{Name: "Total", Kind: reporting.ColumnAggregate, AggSrc: "SUM(amount)"}},
		GrandTotals: true,
	}

	model, err := reporting.Run(spec, source.Catalog(), source.Rows(receipts), reporting.MetaInput{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	if len(model.Root.Children) != 2 {
		t.Errorf("two distinct created-at instants produced %d bucket(s), want 2", len(model.Root.Children))
	}

	// And reversing the receipts must not change the report.
	reversed := []models.Receipt{receipts[1], receipts[0]}
	permuted, err := reporting.Run(spec, source.Catalog(), source.Rows(reversed), reporting.MetaInput{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if permuted.Root.Children[0].Value.String() != model.Root.Children[0].Value.String() {
		t.Errorf("reversing the receipts changed the first bucket")
	}
}

// A receipt amount that was never set is the zero decimal, whose internal
// coefficient is a nil big.Int. It must sum like any other zero.
func TestSource_ZeroValueAmountSums(t *testing.T) {
	source := mustNew(t)

	receipts := []models.Receipt{
		{BaseModel: models.BaseModel{ID: 1}}, // Amount is the zero decimal.Decimal
		{BaseModel: models.BaseModel{ID: 2}, Amount: dec("5.00")},
	}

	spec := reporting.ReportSpec{
		Columns:     []reporting.Column{{Name: "Total", Kind: reporting.ColumnAggregate, AggSrc: "SUM(amount)"}},
		GrandTotals: true,
	}

	model, err := reporting.Run(spec, source.Catalog(), source.Rows(receipts), reporting.MetaInput{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	total := model.GrandTotals[0].Value()
	number, isNumber := total.Decimal()
	if !isNumber || !number.Equal(dec("5.00")) {
		t.Errorf("grand total = %v, want 5.00", total)
	}
}

// A receipt with no status resolves to the empty string, which is a bucket of
// its own. It is not the same as having no status field at all, and the report
// must not quietly file it under (None).
func TestSource_EmptyStatusIsTheEmptyString(t *testing.T) {
	row := mustNew(t).Rows([]models.Receipt{{Name: "Bare"}})[0]

	values := row.Get(KeyStatus)
	if len(values) != 1 {
		t.Fatalf("status resolved to %d values, want 1", len(values))
	}
	text, isText := values[0].Text()
	if !isText || text != "" {
		t.Errorf("status = %v, want the empty string", values[0])
	}
}

// A receipt carrying the same category twice belongs to that bucket once.
// receipt_categories cannot express it, but a row built by hand can.
func TestSource_DuplicateCategoriesAreOneBucket(t *testing.T) {
	source := mustNew(t)

	receipts := []models.Receipt{{
		Amount:     dec("10.00"),
		Categories: []models.Category{{Name: "Clothing"}, {Name: "Clothing"}},
	}}

	spec := reporting.ReportSpec{
		GroupBy:     []reporting.FieldKey{KeyCategory},
		Columns:     []reporting.Column{{Name: "Total", Kind: reporting.ColumnAggregate, AggSrc: "SUM(amount)"}},
		GrandTotals: true,
	}

	model, err := reporting.Run(spec, source.Catalog(), source.Rows(receipts), reporting.MetaInput{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	if len(model.Root.Children) != 1 {
		t.Fatalf("got %d buckets, want 1", len(model.Root.Children))
	}
	number, _ := model.GrandTotals[0].Value().Decimal()
	if !number.Equal(dec("10.00")) {
		t.Errorf("grand total = %s, want 10.00", number)
	}
}

// An instant's calendar parts (Added At, Resolved Date) are read in the app
// zone the source was built with; a calendar day (Date) is
// read in UTC whatever that zone is. 01:00 UTC on Oct 1 is still Sep 30 in New
// York.
func TestSource_InstantPeriodFieldsUseTheAppZone(t *testing.T) {
	newYork, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatal(err)
	}

	receipt := fullReceipt()
	receipt.CreatedAt = time.Date(2026, 10, 1, 1, 0, 0, 0, time.UTC)
	resolved := time.Date(2027, 1, 1, 2, 0, 0, 0, time.UTC)
	receipt.ResolvedDate = &resolved
	receipt.Date = time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		location *time.Location
		want     map[reporting.FieldKey]string
	}{
		{time.UTC, map[reporting.FieldKey]string{
			KeyCreatedAtDay: "2026-10-01", KeyCreatedAtMonth: "2026-10", KeyCreatedAtYear: "2026",
			KeyResolvedDateDay: "2027-01-01", KeyResolvedDateYear: "2027",
			KeyDateDay: "2026-10-01", KeyDateMonth: "2026-10",
		}},
		{newYork, map[reporting.FieldKey]string{
			KeyCreatedAtDay: "2026-09-30", KeyCreatedAtMonth: "2026-09", KeyCreatedAtYear: "2026",
			KeyResolvedDateDay: "2026-12-31", KeyResolvedDateYear: "2026",
			// Calendar days do not move.
			KeyDateDay: "2026-10-01", KeyDateMonth: "2026-10",
		}},
	}
	for _, test := range tests {
		t.Run(test.location.String(), func(t *testing.T) {
			source, err := New(test.location)
			if err != nil {
				t.Fatal(err)
			}
			row := source.Rows([]models.Receipt{receipt})[0]
			for key, want := range test.want {
				if text, _ := row.Measure(key).Text(); text != want {
					t.Errorf("%s = %q, want %q", key, text, want)
				}
			}
		})
	}
}

// Each date field declares the zone a renderer names its day in: the app zone
// for an instant, UTC for a calendar day. Nil builds a UTC source.
func TestSource_DateFieldsDeclareTheirDisplayZone(t *testing.T) {
	newYork, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatal(err)
	}
	source, err := New(newYork)
	if err != nil {
		t.Fatal(err)
	}

	want := map[reporting.FieldKey]*time.Location{
		KeyCreatedAt:    newYork,
		KeyResolvedDate: newYork,
		KeyDate:         time.UTC,
	}
	for key, location := range want {
		field, ok := source.Catalog().Get(key)
		if !ok {
			t.Fatalf("catalog is missing %s", key)
		}
		if field.Location != location {
			t.Errorf("%s declares %v, want %v", key, field.Location, location)
		}
	}

	utcSource, err := New(nil)
	if err != nil {
		t.Fatal(err)
	}
	receipt := models.Receipt{BaseModel: models.BaseModel{CreatedAt: time.Date(2026, 10, 1, 1, 0, 0, 0, time.UTC)}}
	if text, _ := utcSource.Rows([]models.Receipt{receipt})[0].Measure(KeyCreatedAtDay).Text(); text != "2026-10-01" {
		t.Errorf("nil location created_at_day = %q, want the UTC day", text)
	}
}
