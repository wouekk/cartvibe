package utils

import (
	"strings"
	"unicode"
)

// foldReplacer lower-cases nothing itself; it maps the accented letters a household's receipts
// carry (Polish, German, French) onto plain ASCII. "ł" and "ø" do not decompose, so a table is
// the only way, and it avoids pulling golang.org/x/text in as a direct dependency.
var foldReplacer = strings.NewReplacer(
	"ą", "a", "ä", "a", "à", "a", "á", "a", "â", "a", "ã", "a", "å", "a",
	"ć", "c", "č", "c", "ç", "c",
	"ę", "e", "è", "e", "é", "e", "ê", "e", "ë", "e", "ě", "e",
	"ì", "i", "í", "i", "î", "i", "ï", "i",
	"ł", "l",
	"ń", "n", "ñ", "n", "ň", "n",
	"ò", "o", "ó", "o", "ô", "o", "õ", "o", "ö", "o", "ø", "o", "œ", "oe",
	"ś", "s", "š", "s", "ß", "ss",
	"ù", "u", "ú", "u", "û", "u", "ü", "u", "ů", "u",
	"ý", "y", "ÿ", "y",
	"ź", "z", "ż", "z", "ž", "z",
)

// FuzzyTokens lower-cases text, folds accents and splits it on everything that is not a letter or
// a digit, so "CHOC. NOIR 70%" becomes ["choc", "noir", "70"].
func FuzzyTokens(text string) []string {
	folded := foldReplacer.Replace(strings.ToLower(text))
	return strings.FieldsFunc(folded, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}

// FuzzyQuery is a search phrase prepared for matching many texts against it.
type FuzzyQuery struct {
	tokens []string
}

// NewFuzzyQuery tokenizes a search phrase. One-character tokens carry no signal and are dropped.
func NewFuzzyQuery(phrase string) FuzzyQuery {
	tokens := []string{}
	for _, token := range FuzzyTokens(phrase) {
		if len([]rune(token)) >= 2 {
			tokens = append(tokens, token)
		}
	}
	return FuzzyQuery{tokens: tokens}
}

// Empty is true when the phrase had nothing to search for.
func (query FuzzyQuery) Empty() bool {
	return len(query.tokens) == 0
}

// Matches is true when every token of the query matches some token of the text. The tokens must
// all land in the same text, so "dark choc" does not match two different lines.
func (query FuzzyQuery) Matches(text string) bool {
	if query.Empty() {
		return false
	}

	textTokens := FuzzyTokens(text)
	if len(textTokens) == 0 {
		return false
	}

	for _, queryToken := range query.tokens {
		found := false
		for _, textToken := range textTokens {
			if fuzzyTokenMatches(queryToken, textToken) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	return true
}

// fuzzyTokenMatches decides whether one query token q matches one text token t:
//   - t contains q ("choc" in "chocolate");
//   - t is an abbreviation of q, at least three letters long ("choc" for "chocolate");
//   - t is within a small edit distance of q, or of its own same-length prefix, which catches
//     OCR slips and typos ("choclate" for "chocolate").
func fuzzyTokenMatches(q string, t string) bool {
	if strings.Contains(t, q) {
		return true
	}

	qr := []rune(q)
	tr := []rune(t)

	if len(tr) >= 3 && len(tr) < len(qr) && strings.HasPrefix(q, t) {
		return true
	}

	maxDistance := fuzzyMaxDistance(len(qr))
	if maxDistance == 0 {
		return false
	}

	if damerauLevenshtein(qr, tr, maxDistance) <= maxDistance {
		return true
	}

	// A longer text token ("chocolates") is compared by its prefix of the query's length.
	if len(tr) > len(qr) && damerauLevenshtein(qr, tr[:len(qr)], maxDistance) <= maxDistance {
		return true
	}

	return false
}

func fuzzyMaxDistance(length int) int {
	switch {
	case length >= 8:
		return 2
	case length >= 4:
		return 1
	default:
		return 0
	}
}

// damerauLevenshtein is the optimal-string-alignment distance between a and b. It gives up early
// and returns max+1 when the lengths alone already put the distance out of reach.
func damerauLevenshtein(a []rune, b []rune, max int) int {
	if diff := len(a) - len(b); diff > max || -diff > max {
		return max + 1
	}

	previous2 := make([]int, len(b)+1)
	previous := make([]int, len(b)+1)
	current := make([]int, len(b)+1)

	for j := range previous {
		previous[j] = j
	}

	for i := 1; i <= len(a); i++ {
		current[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}

			best := min(previous[j]+1, current[j-1]+1, previous[j-1]+cost)
			if i > 1 && j > 1 && a[i-1] == b[j-2] && a[i-2] == b[j-1] {
				best = min(best, previous2[j-2]+1)
			}
			current[j] = best
		}
		previous2, previous, current = previous, current, previous2
	}

	return previous[len(b)]
}
