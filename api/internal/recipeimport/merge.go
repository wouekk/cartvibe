package recipeimport

import (
	"strings"

	"github.com/shopspring/decimal"
)

// Limits of a stored amount (decimal(10,3), and the item validator's own range).
var (
	maxAmount = decimal.NewFromInt(100000)
	// maxQuantityText is the legacy free-text column's width.
	maxQuantityText = 50
)

// Stored is how an imported quantity is written on a shopping-list item.
//
//   - g, kg, ml, l (and dag, mg, cl, dl converted exactly) fill the structured Amount + Unit.
//   - A bare count, or no unit, is an Amount with an empty Unit.
//   - Any other unit stays in the recipe's language inside the legacy Quantity text ("2 szklanki"), so the unit list
//     and the unit picker are untouched.
type Stored struct {
	Amount   *decimal.Decimal
	Unit     string
	Quantity string
}

func amountFits(a decimal.Decimal) bool {
	return a.Sign() > 0 && a.LessThan(maxAmount) && a.Round(3).Equal(a)
}

// ToStored maps an imported quantity onto the item fields.
func ToStored(amount *decimal.Decimal, unit string) Stored {
	if amount == nil || amount.Sign() <= 0 {
		return Stored{}
	}
	unit = strings.TrimSpace(unit)
	def := lookupUnit(unit)

	structured := func(value decimal.Decimal, symbol string) Stored {
		value = value.Round(3)
		if !amountFits(value) {
			return textStored(*amount, unit)
		}
		return Stored{Amount: &value, Unit: symbol}
	}

	switch {
	case unit == "" || (def != nil && def.kind == kindCount):
		return structured(*amount, "")
	case def != nil && def.kind == kindMetric:
		switch def.key {
		case "g", "kg", "ml", "l":
			return structured(*amount, def.key)
		case "dag", "mg":
			return structured(amount.Mul(def.factor), "g")
		default: // cl, dl
			return structured(amount.Mul(def.factor), "ml")
		}
	default:
		return textStored(*amount, unit)
	}
}

func textStored(amount decimal.Decimal, unit string) Stored {
	text := amount.String()
	if unit != "" {
		text += " " + unit
	}
	if len([]rune(text)) > maxQuantityText {
		text = amount.String()
	}
	return Stored{Quantity: text}
}

// ExistingItem is the part of a shopping-list row the merge needs.
type ExistingItem struct {
	ID       uint
	Name     string
	Amount   *decimal.Decimal
	Unit     string
	Quantity string // legacy free text
	Checked  bool
}

// Incoming is one selected, possibly scaled, preview row. Unit is a free string in the recipe's language.
type Incoming struct {
	Name   string
	Amount *decimal.Decimal
	Unit   string
}

// OpKind says what to do with one incoming row.
type OpKind int

const (
	// OpInsert creates a new item.
	OpInsert OpKind = iota
	// OpUpdate adds the quantity onto an unchecked item (or leaves it, when the row had no quantity).
	OpUpdate
	// OpRevive un-checks a crossed-off item and replaces its quantity.
	OpRevive
)

// Op is one write the merge asks for.
type Op struct {
	Kind   OpKind
	ID     uint   // the existing item, for OpUpdate and OpRevive
	Name   string // OpInsert
	Stored Stored
	// NoChange is set on an OpUpdate that needs no write (a row with no quantity matched an unchecked item).
	NoChange bool
}

// existingQuantity reads what an item already says it needs: the structured amount, or the legacy text re-read with
// the same parser the import uses ("2 szklanki"). ok is false when the item states no readable quantity.
func existingQuantity(e ExistingItem) (qty decimal.Decimal, unit string, ok bool) {
	if e.Amount != nil && e.Amount.Sign() > 0 {
		return *e.Amount, e.Unit, true
	}
	text := strings.TrimSpace(e.Quantity)
	if text == "" {
		return decimal.Zero, "", false
	}
	q, rest, glued := readQuantity(text)
	if q == nil {
		return decimal.Zero, "", false
	}
	u, _, after, hasUnit := matchUnit(rest)
	if glued && !hasUnit {
		return decimal.Zero, "", false
	}
	if !hasUnit {
		after = rest
	}
	if strings.TrimSpace(after) != "" {
		return decimal.Zero, "", false
	}
	return *q, u, true
}

// sumInto adds an incoming quantity onto an existing item, keeping the item's own representation (structured stays
// structured, text stays text). ok is false when the result would not fit the item.
func sumInto(e ExistingItem, eq decimal.Decimal, eu string, in Incoming) (Stored, bool) {
	sum := AddQuantities(eq, eu, *in.Amount, in.Unit)
	if !amountFits(sum) {
		return Stored{}, false
	}
	if e.Amount != nil && e.Amount.Sign() > 0 {
		return Stored{Amount: &sum, Unit: e.Unit}, true
	}
	text := sum.String()
	if eu != "" {
		text += " " + eu
	}
	if len([]rune(text)) > maxQuantityText {
		return Stored{}, false
	}
	return Stored{Quantity: text}, true
}

// PlanMerge decides, row by row, how recipe items land on a list. Rows are handled in order against a working copy,
// so a later row sees what an earlier one did.
//
//   - A same-name unchecked item with a compatible unit gets the quantities summed. Compatible means both bare counts,
//     the same metric family (g/kg, ml/l) or the same other unit.
//   - A same-name unchecked item whose unit is incompatible leaves the incoming row to be inserted, so neither unit is
//     lost.
//   - Otherwise a same-name crossed-off item is un-checked and takes the new quantity.
//   - Otherwise the row is inserted.
//
// Names are compared case- and space-insensitively in Go: SQLite's LOWER() would not fold "Żurek".
func PlanMerge(existing []ExistingItem, incoming []Incoming) []Op {
	work := make([]ExistingItem, len(existing))
	copy(work, existing)

	ops := make([]Op, 0, len(incoming))
	// insertedAt maps a working-copy row created by this plan to its OpInsert, which later rows fold into rather
	// than updating an item that does not exist yet.
	insertedAt := map[int]int{}
	record := func(i int, op Op) {
		if at, ok := insertedAt[i]; ok {
			if !op.NoChange {
				ops[at].Stored = op.Stored
			}
			return
		}
		ops = append(ops, op)
	}
	for _, in := range incoming {
		key := NormalizeName(in.Name)
		if key == "" {
			continue
		}
		stored := ToStored(in.Amount, in.Unit)

		sawUnchecked := false
		merged := false
		for i := range work {
			e := work[i]
			if e.Checked || NormalizeName(e.Name) != key {
				continue
			}
			sawUnchecked = true

			if in.Amount == nil || in.Amount.Sign() <= 0 {
				record(i, Op{Kind: OpUpdate, ID: e.ID, NoChange: true})
				merged = true
				break
			}
			eq, eu, readable := existingQuantity(e)
			if !readable {
				// The item names no quantity yet; the recipe's becomes its quantity.
				record(i, Op{Kind: OpUpdate, ID: e.ID, Stored: stored})
				work[i].Amount, work[i].Unit, work[i].Quantity = stored.Amount, stored.Unit, stored.Quantity
				merged = true
				break
			}
			if !Compatible(eu, in.Unit) {
				continue
			}
			if next, ok := sumInto(e, eq, eu, in); ok {
				record(i, Op{Kind: OpUpdate, ID: e.ID, Stored: next})
				work[i].Amount, work[i].Unit, work[i].Quantity = next.Amount, next.Unit, next.Quantity
				merged = true
				break
			}
		}
		if merged {
			continue
		}

		if !sawUnchecked {
			revived := false
			for i := range work {
				e := work[i]
				if !e.Checked || NormalizeName(e.Name) != key {
					continue
				}
				op := Op{Kind: OpRevive, ID: e.ID, Stored: stored}
				if in.Amount == nil || in.Amount.Sign() <= 0 {
					// Nothing new to say about how much: the item keeps what it had.
					op.Stored = Stored{Amount: e.Amount, Unit: e.Unit, Quantity: e.Quantity}
				}
				ops = append(ops, op)
				work[i].Checked = false
				work[i].Amount, work[i].Unit, work[i].Quantity = op.Stored.Amount, op.Stored.Unit, op.Stored.Quantity
				revived = true
				break
			}
			if revived {
				continue
			}
		}

		ops = append(ops, Op{Kind: OpInsert, Name: strings.TrimSpace(in.Name), Stored: stored})
		insertedAt[len(work)] = len(ops) - 1
		work = append(work, ExistingItem{
			Name: in.Name, Amount: stored.Amount, Unit: stored.Unit, Quantity: stored.Quantity,
		})
	}
	return ops
}
