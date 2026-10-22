package receiptsource

import (
	"math/big"
	"sort"
	"strings"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/reporting"

	"github.com/shopspring/decimal"
)

// minimumShareScale is the fewest decimal places a line share is allocated in.
// A receipt amount is stored as decimal(10,2), so cents are the natural unit; a
// value carrying more places keeps them.
const minimumShareScale = 2

// Line is one priced product line of a receipt, as a report reads it: what it
// cost and the labels it carries. The service layer builds it, resolving the
// category's current name and marking what the caller may not see as
// (Restricted), so this package reads no database.
type Line struct {
	Amount decimal.Decimal
	// Category is the line's category name; "" is Uncategorized.
	Category string
	Tags     []string
	// Health is the stored rating (HEALTHY, MEDIUM, ...); "" or UNKNOWN is none.
	Health string
	// Planned is whether the line was on the shopping list; nil counts as planned.
	Planned *bool
}

// LineDimensions says which fields that come from product lines a report cuts
// by, as a grouping level or the aggregate detail dimension. Cutting by one turns
// a receipt into a row per distinct value, each carrying what those lines cost.
type LineDimensions struct {
	Category bool
	Tag      bool
	Health   bool
	Planned  bool
}

// Active reports whether the report cuts by any line field at all.
func (d LineDimensions) Active() bool {
	return d.Category || d.Tag || d.Health || d.Planned
}

// IsLineField reports whether key is read off a receipt's product lines.
func IsLineField(key reporting.FieldKey) bool {
	switch key {
	case KeyCategory, KeyTag, KeyHealth, KeyPlanned:
		return true
	}
	return false
}

// LineDimensionsFor builds the dimensions a report cuts by from the field keys it
// groups or aggregates by. Keys that are not line fields are ignored.
func LineDimensionsFor(keys []string) LineDimensions {
	var dimensions LineDimensions
	for _, key := range keys {
		switch reporting.FieldKey(key) {
		case KeyCategory:
			dimensions.Category = true
		case KeyTag:
			dimensions.Tag = true
		case KeyHealth:
			dimensions.Health = true
		case KeyPlanned:
			dimensions.Planned = true
		}
	}
	return dimensions
}

// HealthLabel names a stored health rating for a report; "" means no rating.
func HealthLabel(health string) string {
	switch strings.ToUpper(health) {
	case models.HEALTH_HEALTHY:
		return "Healthy"
	case models.HEALTH_MEDIUM:
		return "Medium"
	case models.HEALTH_UNHEALTHY:
		return "Unhealthy"
	case models.HEALTH_NOT_FOOD:
		return "Not food"
	}
	return ""
}

// PlannedLabel names a line's planned mark. Only false is unplanned: a receipt on
// no list, or not compared yet, counts as planned.
func PlannedLabel(planned *bool) string {
	if planned != nil && !*planned {
		return "Unplanned"
	}
	return "Planned"
}

// lineValues are one line's labels, each "" when it has none.
type lineValues struct {
	category string
	tags     []string
	health   string
	planned  string
}

func valuesOf(line Line) lineValues {
	return lineValues{
		category: line.Category,
		tags:     distinctStrings(line.Tags),
		health:   HealthLabel(line.Health),
		planned:  PlannedLabel(line.Planned),
	}
}

// lineKey is one bucket a receipt's money is cut into: the values of the line
// fields the report cuts by, "" for a field it does not cut by or a line without
// that value.
type lineKey struct {
	category string
	tag      string
	health   string
	planned  string
}

// lineBucket is what a key collected: its share of the receipt and which lines
// it came from, to label the fields the report does not cut by.
type lineBucket struct {
	key    lineKey
	amount decimal.Decimal
	lines  []int
}

// RowsWithLines maps receipts to engine rows, reading Category, Tag, Health and
// Planned off each receipt's product lines. lines is parallel to receipts; a nil
// or short slice means a receipt without lines. It also returns how many rows
// each receipt became, which is what a receipt count is read from.
//
// Without a line dimension every receipt is one row, and the line fields are
// label values: the distinct categories, tags, ratings and marks of its lines.
//
// With one, a receipt becomes a row per distinct value (combination) of the line
// fields the report cuts by, carrying what those lines cost. A line with two tags
// counts toward both, as the Dashboard's tag tiles do. What the lines do not
// account for (the whole amount, for a receipt without lines) is one more row with
// those fields empty, which the engine shows as (None). So a receipt's rows add
// back up to its amount, except for the deliberate tag fan-out; see allocateToLines
// for lines that add up to more than the receipt.
func (s Source) RowsWithLines(receipts []models.Receipt, lines [][]Line, dimensions LineDimensions) ([]reporting.Row, []int) {
	rows := make([]reporting.Row, 0, len(receipts))
	perReceipt := make([]int, len(receipts))

	for index := range receipts {
		var receiptLines []Line
		if index < len(lines) {
			receiptLines = lines[index]
		}

		base := s.row(&receipts[index])
		if !dimensions.Active() {
			setLineLabels(base, receiptLines, allLineIndexes(receiptLines), LineDimensions{})
			rows = append(rows, base)
			perReceipt[index] = 1
			continue
		}

		receiptRows := cutByLines(base, receipts[index].Amount, receiptLines, dimensions)
		rows = append(rows, receiptRows...)
		perReceipt[index] = len(receiptRows)
	}

	return rows, perReceipt
}

func cutByLines(base reporting.Row, amount decimal.Decimal, lines []Line, dimensions LineDimensions) []reporting.Row {
	shares, rest := allocateToLines(amount, lines)

	buckets := make([]*lineBucket, 0, len(lines))
	bucketByKey := make(map[lineKey]*lineBucket, len(lines))
	for index, line := range lines {
		for _, key := range keysFor(valuesOf(line), dimensions) {
			bucket, found := bucketByKey[key]
			if !found {
				bucket = &lineBucket{key: key, amount: decimal.Zero}
				bucketByKey[key] = bucket
				buckets = append(buckets, bucket)
			}
			bucket.amount = bucket.amount.Add(shares[index])
			bucket.lines = append(bucket.lines, index)
		}
	}

	rows := make([]reporting.Row, 0, len(buckets)+1)
	for _, bucket := range buckets {
		row := cloneRow(base)
		row[KeyAmount] = []reporting.Value{reporting.Num(bucket.amount)}
		setCutValue(row, KeyCategory, dimensions.Category, bucket.key.category)
		setCutValue(row, KeyTag, dimensions.Tag, bucket.key.tag)
		setCutValue(row, KeyHealth, dimensions.Health, bucket.key.health)
		setCutValue(row, KeyPlanned, dimensions.Planned, bucket.key.planned)
		setLineLabels(row, lines, bucket.lines, dimensions)
		rows = append(rows, row)
	}

	if len(lines) == 0 || !rest.IsZero() {
		row := cloneRow(base)
		row[KeyAmount] = []reporting.Value{reporting.Num(rest)}
		for _, key := range []reporting.FieldKey{KeyCategory, KeyTag, KeyHealth, KeyPlanned} {
			delete(row, key)
		}
		rows = append(rows, row)
	}

	return rows
}

// keysFor is the buckets one line falls into: one, or one per tag when the
// report cuts by tag and the line has several.
func keysFor(values lineValues, dimensions LineDimensions) []lineKey {
	key := lineKey{}
	if dimensions.Category {
		key.category = values.category
	}
	if dimensions.Health {
		key.health = values.health
	}
	if dimensions.Planned {
		key.planned = values.planned
	}
	if !dimensions.Tag || len(values.tags) == 0 {
		return []lineKey{key}
	}

	keys := make([]lineKey, 0, len(values.tags))
	for _, tag := range values.tags {
		tagged := key
		tagged.tag = tag
		keys = append(keys, tagged)
	}
	return keys
}

// setCutValue writes a field the report cuts by: its one value, or none.
func setCutValue(row reporting.Row, key reporting.FieldKey, cut bool, value string) {
	if !cut {
		return
	}
	if value == "" {
		delete(row, key)
		return
	}
	row[key] = []reporting.Value{reporting.Str(value)}
}

// setLineLabels writes the line fields the report does not cut by, as the
// distinct values of the given lines.
func setLineLabels(row reporting.Row, lines []Line, indexes []int, cut LineDimensions) {
	var categories, tags, healths, planned []string
	for _, index := range indexes {
		values := valuesOf(lines[index])
		categories = append(categories, values.category)
		tags = append(tags, values.tags...)
		healths = append(healths, values.health)
		planned = append(planned, values.planned)
	}

	if !cut.Category {
		setLabelValues(row, KeyCategory, categories)
	}
	if !cut.Tag {
		setLabelValues(row, KeyTag, tags)
	}
	if !cut.Health {
		setLabelValues(row, KeyHealth, healths)
	}
	if !cut.Planned {
		setLabelValues(row, KeyPlanned, planned)
	}
}

func setLabelValues(row reporting.Row, key reporting.FieldKey, values []string) {
	distinct := distinctStrings(values)
	if len(distinct) == 0 {
		delete(row, key)
		return
	}
	cells := make([]reporting.Value, 0, len(distinct))
	for _, value := range distinct {
		cells = append(cells, reporting.Str(value))
	}
	row[key] = cells
}

// distinctStrings returns the non-empty values once each, sorted, so a label
// never depends on the order the lines were read in.
func distinctStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	distinct := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		distinct = append(distinct, value)
	}
	sort.Strings(distinct)
	return distinct
}

func allLineIndexes(lines []Line) []int {
	indexes := make([]int, len(lines))
	for index := range lines {
		indexes[index] = index
	}
	return indexes
}

func cloneRow(row reporting.Row) reporting.Row {
	clone := make(reporting.Row, len(row))
	for key, values := range row {
		clone[key] = values
	}
	return clone
}

// allocateToLines says how much of a receipt's amount each line accounts for,
// and what is left over.
//
// Normally a line accounts for exactly what it cost, and the rest is the
// receipt's amount minus the lines (a discount, a deposit, a line the AI missed).
// When the lines add up to more than the receipt, or point the other way (a
// discount printed as a total rather than as a line), they are scaled to the
// receipt instead and nothing is left over; otherwise the report's grand total
// would no longer be what was spent.
func allocateToLines(amount decimal.Decimal, lines []Line) ([]decimal.Decimal, decimal.Decimal) {
	shares := make([]decimal.Decimal, len(lines))
	sum := decimal.Zero
	for index, line := range lines {
		shares[index] = line.Amount
		sum = sum.Add(line.Amount)
	}

	if sum.IsZero() || (sum.Sign() == amount.Sign() && sum.Abs().LessThanOrEqual(amount.Abs())) {
		return shares, amount.Sub(sum)
	}

	weights := make([]decimal.Decimal, len(lines))
	for index, line := range lines {
		weights[index] = line.Amount
	}
	return allocateProportionally(amount, weights, sum), decimal.Zero
}

// allocateProportionally divides total in proportion to weights (which add up to
// sum, never zero), in whole units of the total's scale (at least cents), so the
// shares add back up to total exactly.
//
// Every share is first truncated toward zero, then the units that leaves over go
// one at a time to the shares that lost the most, ties to the earlier line. It
// works in exact rationals, never Div, which would read shopspring's process-wide
// DivisionPrecision.
func allocateProportionally(total decimal.Decimal, weights []decimal.Decimal, sum decimal.Decimal) []decimal.Decimal {
	scale := int32(minimumShareScale)
	if places := -total.Exponent(); places > scale {
		scale = places
	}

	totalUnits := total.Shift(scale).BigInt()
	sumRat := sum.Rat()

	type share struct {
		units    *big.Int
		residual *big.Rat
	}
	parts := make([]share, len(weights))
	allocated := new(big.Int)
	for index, weight := range weights {
		exact := new(big.Rat).SetInt(totalUnits)
		exact.Mul(exact, weight.Rat())
		exact.Quo(exact, sumRat)

		units := new(big.Int).Quo(exact.Num(), exact.Denom())
		residual := new(big.Rat).Sub(exact, new(big.Rat).SetInt(units))

		parts[index] = share{units: units, residual: residual}
		allocated.Add(allocated, units)
	}

	left := new(big.Int).Sub(totalUnits, allocated)
	step := left.Sign()
	order := make([]int, len(parts))
	for index := range order {
		order[index] = index
	}
	// The units owed go to the residuals pointing the same way, largest first.
	sort.SliceStable(order, func(i, j int) bool {
		a := new(big.Rat).Mul(parts[order[i]].residual, big.NewRat(int64(step), 1))
		b := new(big.Rat).Mul(parts[order[j]].residual, big.NewRat(int64(step), 1))
		return a.Cmp(b) > 0
	})
	for given := 0; left.Sign() != 0 && given < len(order); given++ {
		parts[order[given]].units.Add(parts[order[given]].units, big.NewInt(int64(step)))
		left.Sub(left, big.NewInt(int64(step)))
	}

	shares := make([]decimal.Decimal, len(parts))
	for index, part := range parts {
		shares[index] = decimal.NewFromBigInt(part.units, -scale)
	}
	return shares
}
