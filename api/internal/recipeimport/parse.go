package recipeimport

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/shopspring/decimal"
)

// Ingredient is one parsed recipe line. Name and Unit are in the recipe's own language; Quantity is nil when the line
// gave none ("salt to taste").
type Ingredient struct {
	Name     string
	Quantity *decimal.Decimal
	Unit     string
	// Original is the cleaned source line, shown when a person wants to see what a row came from.
	Original string
}

func frac(num, den int64) decimal.Decimal {
	return decimal.NewFromInt(num).Div(decimal.NewFromInt(den)).Round(2)
}

// glyphFractions are the Unicode vulgar fractions. Thirds and the like round to two places (⅓ → 0.33, ⅔ → 0.67); the
// preview snaps them back to a whole number when scaled (0.33 × 3 → 1).
var glyphFractions = map[rune]decimal.Decimal{
	'½': frac(1, 2), '⅓': frac(1, 3), '⅔': frac(2, 3), '¼': frac(1, 4), '¾': frac(3, 4),
	'⅕': frac(1, 5), '⅖': frac(2, 5), '⅗': frac(3, 5), '⅘': frac(4, 5),
	'⅙': frac(1, 6), '⅚': frac(5, 6), '⅛': frac(1, 8), '⅜': frac(3, 8), '⅝': frac(5, 8), '⅞': frac(7, 8),
}

func isSpace(r rune) bool { return r == ' ' || r == '\u00a0' || r == '\u202f' || r == '\t' }

func isDigit(r rune) bool { return r >= '0' && r <= '9' }

func skipSpaces(rs []rune, i int) int {
	for i < len(rs) && isSpace(rs[i]) {
		i++
	}
	return i
}

func readDigits(rs []rune, i int) (string, int) {
	start := i
	for i < len(rs) && isDigit(rs[i]) {
		i++
	}
	return string(rs[start:i]), i
}

// readFraction reads "a/b" at i (digits, slash, digits, no spaces).
func readFraction(rs []rune, i int) (decimal.Decimal, int, bool) {
	num, j := readDigits(rs, i)
	if num == "" || j >= len(rs) || rs[j] != '/' {
		return decimal.Zero, i, false
	}
	den, k := readDigits(rs, j+1)
	if den == "" {
		return decimal.Zero, i, false
	}
	n, err1 := decimal.NewFromString(num)
	d, err2 := decimal.NewFromString(den)
	if err1 != nil || err2 != nil || d.IsZero() {
		return decimal.Zero, i, false
	}
	return n.Div(d).Round(2), k, true
}

// readNumber reads one quantity at i: "2", "0,5", "1.5", "½", "1½", "1 ½", "1/2", "1 1/2".
func readNumber(rs []rune, i int) (decimal.Decimal, int, bool) {
	if i >= len(rs) {
		return decimal.Zero, i, false
	}
	if v, ok := glyphFractions[rs[i]]; ok {
		return v, i + 1, true
	}
	if !isDigit(rs[i]) {
		return decimal.Zero, i, false
	}
	if v, next, ok := readFraction(rs, i); ok {
		return v, next, true
	}
	whole, j := readDigits(rs, i)
	text := whole
	// A decimal separator only counts when digits follow it ("1. Mehl" is a list marker, not 1.0).
	if j+1 < len(rs) && (rs[j] == ',' || rs[j] == '.') && isDigit(rs[j+1]) {
		var tail string
		tail, j = readDigits(rs, j+1)
		text += "." + tail
	}
	value, err := decimal.NewFromString(text)
	if err != nil {
		return decimal.Zero, i, false
	}
	// Mixed number: "1½" or "1 ½" or "1 1/2" (only after a plain integer).
	if !strings.Contains(text, ".") {
		k := skipSpaces(rs, j)
		if k < len(rs) {
			if g, ok := glyphFractions[rs[k]]; ok {
				return value.Add(g), k + 1, true
			}
			if f, next, ok := readFraction(rs, k); ok && k > j {
				return value.Add(f), next, true
			}
		}
	}
	return value.Round(2), j, true
}

var rangeWords = []string{"to", "bis", "à", "do", "or", "ou", "oder"}

// readQuantity reads a quantity at the start of s, with an optional approximation prefix ("ca.", "~") and a range
// ("2-3", "2 to 3": the upper bound wins). rest is what follows, left-trimmed.
func readQuantity(s string) (qty *decimal.Decimal, rest string, glued bool) {
	rs := []rune(s)
	i := skipSpaces(rs, 0)
	for _, prefix := range []string{"~", "ca.", "ca ", "circa ", "około ", "about ", "approx. ", "approx "} {
		if trimmed, ok := trimPrefixFold(string(rs[i:]), prefix); ok {
			rs = []rune(trimmed)
			i = skipSpaces(rs, 0)
			break
		}
	}
	value, next, ok := readNumber(rs, i)
	if !ok {
		return nil, s, false
	}
	// Range: take the upper bound.
	j := skipSpaces(rs, next)
	if j < len(rs) && (rs[j] == '-' || rs[j] == '–' || rs[j] == '—') {
		if upper, after, ok := readNumber(rs, skipSpaces(rs, j+1)); ok {
			value, next = upper, after
		}
	} else {
		for _, word := range rangeWords {
			if trimmed, ok := trimPrefixFold(string(rs[j:]), word+" "); ok && j > next {
				tr := []rune(trimmed)
				if upper, after, ok := readNumber(tr, skipSpaces(tr, 0)); ok {
					value = upper
					rs = tr
					next = after
					break
				}
			}
		}
	}
	if value.Sign() <= 0 {
		return nil, s, false
	}
	glued = next < len(rs) && unicode.IsLetter(rs[next])
	rest = strings.TrimLeftFunc(string(rs[next:]), unicode.IsSpace)
	return &value, rest, glued
}

// trimPrefixFold removes prefix from s, ignoring case, and reports whether it was there.
func trimPrefixFold(s, prefix string) (string, bool) {
	sr, pr := []rune(s), []rune(prefix)
	if len(sr) < len(pr) {
		return s, false
	}
	for i, r := range pr {
		if unicode.ToLower(sr[i]) != unicode.ToLower(r) {
			return s, false
		}
	}
	return string(sr[len(pr):]), true
}

// connectors link a unit to the ingredient: "200 g de farine", "100 g d'amandes", "1 cup of flour".
var connectors = []string{"de la ", "de l'", "de l’", "of the ", "of ", "du ", "des ", "de ", "d'", "d’"}

func stripConnector(s string) string {
	for _, c := range connectors {
		if trimmed, ok := trimPrefixFold(s, c); ok {
			return strings.TrimLeftFunc(trimmed, unicode.IsSpace)
		}
	}
	return s
}

// cleanName drops (parenthetical notes) and everything after the first comma, semicolon or spaced dash, and tidies
// the spacing. The words stay in the recipe's language and case.
func cleanName(s string) string {
	var b strings.Builder
	depth := 0
	for _, r := range s {
		switch {
		case r == '(' || r == '[':
			depth++
		case (r == ')' || r == ']') && depth > 0:
			depth--
		case depth == 0:
			b.WriteRune(r)
		}
	}
	out := b.String()
	for _, sep := range []string{",", ";", " - ", " – ", " — "} {
		if idx := strings.Index(out, sep); idx >= 0 {
			out = out[:idx]
		}
	}
	out = strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		if isSpace(r) {
			return ' '
		}
		return r
	}, out)), " ")
	return strings.Trim(out, " .:;-–—*•")
}

// attachedSuffix finds a plural written in brackets straight after a word: "Ei(er)", "Prise(n)", "tomato(es)".
var attachedSuffix = regexp.MustCompile(`(\p{L})\((\p{L}{1,4})\)`)

// ParseLine turns one cleaned line into an ingredient. ok is false when nothing usable is left. A line that is only a
// quantity (and unit) comes back with an empty Name; ParseLines merges it with the line that follows.
func ParseLine(line string) (Ingredient, bool) {
	line = strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		if isSpace(r) {
			return ' '
		}
		return r
	}, line)), " ")
	if line == "" {
		return Ingredient{}, false
	}
	// "3 große Ei(er)" is "3 große Eier": an attached bracket is part of the word, not a note to drop.
	line = attachedSuffix.ReplaceAllString(line, "$1$2")
	ing := Ingredient{Original: line}

	if qty, rest, glued := readQuantity(line); qty != nil {
		unit, _, afterUnit, hasUnit := matchUnit(rest)
		switch {
		case glued && !hasUnit:
			// "7up", "2x4": the number is part of a name, not a quantity.
		default:
			ing.Quantity = qty
			if hasUnit {
				ing.Unit = unit
				rest = stripConnector(afterUnit)
			}
			ing.Name = cleanName(rest)
			return ing, ing.Name != "" || ing.Quantity != nil
		}
	}

	if name, qty, unit, ok := parseTrailingQuantity(line); ok {
		ing.Name, ing.Quantity, ing.Unit = name, qty, unit
		return ing, true
	}

	ing.Name = cleanName(line)
	return ing, ing.Name != ""
}

// parseTrailingQuantity handles "Mąka pszenna – 200 g" and "Salt, 1 tsp": a name, a separator, then only a quantity
// and an optional unit.
func parseTrailingQuantity(line string) (name string, qty *decimal.Decimal, unit string, ok bool) {
	for _, sep := range []string{" - ", " – ", " — ", ": ", ", "} {
		idx := strings.LastIndex(line, sep)
		if idx <= 0 {
			continue
		}
		left, right := strings.TrimSpace(line[:idx]), strings.TrimSpace(line[idx+len(sep):])
		q, rest, glued := readQuantity(right)
		if q == nil {
			continue
		}
		u, _, after, hasUnit := matchUnit(rest)
		if !hasUnit && glued {
			continue
		}
		if !hasUnit {
			after = rest
		}
		if cleanName(after) != "" {
			continue
		}
		cleaned := cleanName(left)
		if cleaned == "" {
			continue
		}
		return cleaned, q, u, true
	}
	return "", nil, "", false
}
