// Package receiptsource maps receipts onto the rows the reporting engine
// consumes.
//
// It is the only part of the reporting system that knows what a receipt is.
// Everything downstream — grouping, aggregation, formulas, the report model —
// works on typed values and would serve any other source just as well. Reporting
// at item grain, or a dashboard widget over something else entirely, adds a
// sibling of this package rather than changing the engine.
//
// It fetches nothing either. Receipts arrive already loaded, and the caller is
// responsible for having preloaded the associations the report reads.
package receiptsource

import (
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/reporting"

	"github.com/shopspring/decimal"
)

// The built-in fields a report may reference. Keys are plain identifiers so a
// formula can name one without quoting, as in SUM(amount).
const (
	KeyReceiptID    reporting.FieldKey = "receipt_id"
	KeyName         reporting.FieldKey = "name"
	KeyShop         reporting.FieldKey = "shop"
	KeyAmount       reporting.FieldKey = "amount"
	KeyDate         reporting.FieldKey = "date"
	KeyResolvedDate reporting.FieldKey = "resolved_date"
	KeyCreatedAt    reporting.FieldKey = "created_at"
	KeyStatus       reporting.FieldKey = "status"
	KeyPaidBy       reporting.FieldKey = "paid_by"
	KeyGroup        reporting.FieldKey = "group"
	// The line fields: read off the receipt's product lines (see lines.go), not
	// the receipt.
	KeyCategory reporting.FieldKey = "category"
	KeyTag      reporting.FieldKey = "tag"
	KeyHealth   reporting.FieldKey = "health"
	KeyPlanned  reporting.FieldKey = "planned"

	// Derived date-period fields. A report groups by one of these to bucket
	// receipts by calendar day, month, or year; the raw date fields above carry
	// the exact instant, which would put every receipt in its own group.
	KeyDateDay   reporting.FieldKey = "date_day"
	KeyDateMonth reporting.FieldKey = "date_month"
	KeyDateYear  reporting.FieldKey = "date_year"

	KeyResolvedDateDay   reporting.FieldKey = "resolved_date_day"
	KeyResolvedDateMonth reporting.FieldKey = "resolved_date_month"
	KeyResolvedDateYear  reporting.FieldKey = "resolved_date_year"

	KeyCreatedAtDay   reporting.FieldKey = "created_at_day"
	KeyCreatedAtMonth reporting.FieldKey = "created_at_month"
	KeyCreatedAtYear  reporting.FieldKey = "created_at_year"
)

// builtinFields returns the fields every receipt report may reference.
//
// Category, Tag, Health and Planned come from the receipt's product lines and
// are multi-valued: a receipt's lines may carry several. A report that cuts by
// one divides the receipt by its lines' amounts (RowsWithLines), so no receipt
// is counted in full in two categories.
//
// The two kinds of date are read in different zones (see New): a receipt's Date
// is a calendar day, read in UTC; Resolved Date and Added At are instants, read
// in the app's time zone.
func builtinFields(location *time.Location) []reporting.FieldRef {
	fields := []reporting.FieldRef{
		{Key: KeyReceiptID, Label: "Receipt Id", DataType: reporting.TypeNumber},
		{Key: KeyName, Label: "Name", DataType: reporting.TypeString},
		{Key: KeyShop, Label: "Shop", DataType: reporting.TypeString},
		{Key: KeyAmount, Label: "Amount", DataType: reporting.TypeCurrency},
		{Key: KeyDate, Label: "Date", DataType: reporting.TypeDate, Location: time.UTC},
		{Key: KeyResolvedDate, Label: "Settled on", DataType: reporting.TypeDate, Location: location},
		{Key: KeyCreatedAt, Label: "Added At", DataType: reporting.TypeDate, Location: location},
		{Key: KeyStatus, Label: "Status", DataType: reporting.TypeString},
		// The key stays paid_by so saved templates keep working; the family app calls it Added by.
		{Key: KeyPaidBy, Label: "Added by", DataType: reporting.TypeString},
		{Key: KeyGroup, Label: "Group", DataType: reporting.TypeString},
		{Key: KeyCategory, Label: "Category", DataType: reporting.TypeString, Multi: true},
		{Key: KeyTag, Label: "Tag", DataType: reporting.TypeString, Multi: true},
		{Key: KeyHealth, Label: "Health", DataType: reporting.TypeString, Multi: true},
		{Key: KeyPlanned, Label: "Planned", DataType: reporting.TypeString, Multi: true},
	}
	fields = append(fields, dateFieldRefs(KeyDateDay, KeyDateMonth, KeyDateYear, "Date")...)
	fields = append(fields, dateFieldRefs(KeyResolvedDateDay, KeyResolvedDateMonth, KeyResolvedDateYear, "Settled on")...)
	fields = append(fields, dateFieldRefs(KeyCreatedAtDay, KeyCreatedAtMonth, KeyCreatedAtYear, "Added At")...)
	return fields
}

// dateFieldRefs builds the day/month/year string fields derived from one date
// column, labelled off a shared prefix (e.g. "Date (Month)"). They are strings,
// not dates, so the engine buckets them by their exact ISO text.
func dateFieldRefs(dayKey, monthKey, yearKey reporting.FieldKey, labelPrefix string) []reporting.FieldRef {
	return []reporting.FieldRef{
		{Key: dayKey, Label: labelPrefix + " (Day)", DataType: reporting.TypeString},
		{Key: monthKey, Label: labelPrefix + " (Month)", DataType: reporting.TypeString},
		{Key: yearKey, Label: labelPrefix + " (Year)", DataType: reporting.TypeString},
	}
}

// Source maps receipts to engine rows.
type Source struct {
	catalog reporting.FieldCatalog

	// location is the app's time zone: the zone an instant (created_at,
	// resolved_date) is read in to decide which calendar day, month and year it
	// falls in. The receipt's Date is a calendar day and is always read in UTC,
	// since it is stored as midnight UTC of its day.
	location *time.Location
}

// New builds a Source.
//
// location is the app's time zone, which decides the calendar day of an
// instant (Added At, Resolved Date): a receipt added at 01:00 UTC on Oct 1 was
// added on Sep 30 in New York. The receipt's Date ignores it and is read in
// UTC. Nil means UTC. The source takes the zone as a parameter rather than
// reading it, so the package stays free of settings.
func New(location *time.Location) (Source, error) {
	if location == nil {
		location = time.UTC
	}

	catalog, err := reporting.NewFieldCatalog(builtinFields(location)...)
	if err != nil {
		return Source{}, err
	}

	return Source{catalog: catalog, location: location}, nil
}

// Catalog returns the fields a report run against this source may reference.
func (s Source) Catalog() reporting.FieldCatalog { return s.catalog }

// Rows resolves receipts without product lines into engine rows, one row per
// receipt, in the order they were given. The engine preserves that order for a
// records-mode report, so the caller's query decides how those rows are sorted.
// A report reading lines uses RowsWithLines.
//
// The caller must have preloaded PaidByUser and Group for their display names.
// An association that was not loaded resolves to no value, which the engine
// reports as a (None) bucket. A missing preload therefore shows up as an empty
// group rather than as a crash.
func (s Source) Rows(receipts []models.Receipt) []reporting.Row {
	rows, _ := s.RowsWithLines(receipts, nil, LineDimensions{})
	return rows
}

func (s Source) row(receipt *models.Receipt) reporting.Row {
	row := reporting.Row{
		KeyReceiptID: {reporting.Num(decimal.NewFromInt(int64(receipt.ID)))},
		KeyName:      {reporting.Str(receipt.Name)},
		// The shop the receipt was read as, else its name: what the receipts table shows in its Shop column.
		KeyShop:      {reporting.Str(shopOf(receipt))},
		KeyAmount:    {reporting.Num(receipt.Amount)},
		KeyDate:      {reporting.DateVal(receipt.Date)},
		KeyCreatedAt: {reporting.DateVal(receipt.CreatedAt)},
		KeyStatus:    {reporting.Str(statusLabel(receipt.Status))},
	}

	setDateParts(row, KeyDateDay, KeyDateMonth, KeyDateYear, receipt.Date, time.UTC)
	setDateParts(row, KeyCreatedAtDay, KeyCreatedAtMonth, KeyCreatedAtYear, receipt.CreatedAt, s.location)

	if receipt.ResolvedDate != nil {
		row[KeyResolvedDate] = []reporting.Value{reporting.DateVal(*receipt.ResolvedDate)}
		setDateParts(row, KeyResolvedDateDay, KeyResolvedDateMonth, KeyResolvedDateYear, *receipt.ResolvedDate, s.location)
	}
	if displayName := userDisplayName(receipt.PaidByUser); len(displayName) > 0 {
		row[KeyPaidBy] = []reporting.Value{reporting.Str(displayName)}
	}
	if len(receipt.Group.Name) > 0 {
		row[KeyGroup] = []reporting.Value{reporting.Str(receipt.Group.Name)}
	}

	return row
}

// setDateParts writes the day/month/year strings derived from one date onto the
// row. Each is zero-padded ISO ("2006-01-02" / "2006-01" / "2006"), so the
// values sort chronologically as plain strings and group into calendar buckets.
//
// The zone is an explicit argument, never the value's own location, so a
// bucket does not depend on how the instant happened to be loaded: UTC for a
// calendar-day field, the app's time zone for an instant.
func setDateParts(row reporting.Row, dayKey, monthKey, yearKey reporting.FieldKey, moment time.Time, location *time.Location) {
	local := moment.In(location)
	row[dayKey] = []reporting.Value{reporting.Str(local.Format("2006-01-02"))}
	row[monthKey] = []reporting.Value{reporting.Str(local.Format("2006-01"))}
	row[yearKey] = []reporting.Value{reporting.Str(local.Format("2006"))}
}

// userDisplayName prefers what a user chose to be called, falling back to the
// name they log in with, which is how the dashboard names a payer.
func userDisplayName(user models.User) string {
	if len(user.DisplayName) > 0 {
		return user.DisplayName
	}
	return user.Username
}

// statusLabel is a status as a family reads it, the same two words the app shows: OPEN,
// NEEDS_ATTENTION and DRAFT are "To check", RESOLVED and DECLINED "Settled". An empty or unknown
// status stays as it is, so nothing is hidden.
func statusLabel(status models.ReceiptStatus) string {
	switch status {
	case models.OPEN, models.NEEDS_ATTENTION, models.DRAFT:
		return "To check"
	case models.RESOLVED, models.DECLINED:
		return "Settled"
	default:
		return string(status)
	}
}

// shopOf is the shop a receipt belongs to for reporting: the shop read from it, else its name.
func shopOf(receipt *models.Receipt) string {
	if receipt.ShopName != "" {
		return receipt.ShopName
	}
	return receipt.Name
}
