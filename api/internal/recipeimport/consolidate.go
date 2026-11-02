package recipeimport

import (
	"strings"

	"github.com/shopspring/decimal"
)

// NormalizeName is the key two item names are compared under: trimmed, lower-case, single spaces. It matches
// models.NormalizeProductName (kept separate so this package stays free of the database models) and, unlike SQLite's
// LOWER(), folds non-ASCII letters ("Żurek" and "żurek" are one name).
func NormalizeName(name string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(name))), " ")
}

// unitGroup says which units can be summed: all of one metric family, all bare counts, or one exact other unit.
func unitGroup(unit string) string {
	def := lookupUnit(unit)
	switch {
	case def == nil:
		return "u:" + UnitKey(unit)
	case def.kind == kindMetric:
		return "m:" + def.family
	case def.kind == kindCount:
		return "u:"
	default:
		return "u:" + def.key
	}
}

// factorOf is how many base units (g or ml) one of the unit is; 1 for anything that is not metric.
func factorOf(unit string) decimal.Decimal {
	if def := lookupUnit(unit); def != nil && def.kind == kindMetric {
		return def.factor
	}
	return decimal.NewFromInt(1)
}

// AddQuantities returns a in a's unit plus b converted from bFactor-sized units to aFactor-sized ones.
func AddQuantities(a decimal.Decimal, aUnit string, b decimal.Decimal, bUnit string) decimal.Decimal {
	return a.Add(b.Mul(factorOf(bUnit)).Div(factorOf(aUnit))).Round(3)
}

// Compatible reports whether two units can be summed: both bare counts (or none), the same metric family, or the same
// other unit once plural and singular spellings are folded together.
func Compatible(a, b string) bool {
	return unitGroup(a) == unitGroup(b)
}

// Consolidate folds rows naming the same ingredient (butter for the dough and butter for the topping) into one,
// summing quantities. Rows whose units cannot be summed (g against a cup) stay apart. First-seen order is kept, the
// first row's unit and wording win, and a row without a quantity never overrides one with a number.
func Consolidate(items []Ingredient) []Ingredient {
	out := make([]Ingredient, 0, len(items))
	index := map[string]int{}
	for _, item := range items {
		key := NormalizeName(item.Name) + "\x00" + unitGroup(item.Unit)
		at, seen := index[key]
		if !seen {
			index[key] = len(out)
			out = append(out, item)
			continue
		}
		kept := &out[at]
		switch {
		case item.Quantity == nil:
		case kept.Quantity == nil:
			kept.Quantity, kept.Unit = item.Quantity, item.Unit
		default:
			sum := AddQuantities(*kept.Quantity, kept.Unit, *item.Quantity, item.Unit)
			kept.Quantity = &sum
		}
	}
	return out
}
