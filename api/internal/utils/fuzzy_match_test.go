package utils

import "testing"

func TestFuzzyQueryMatches(t *testing.T) {
	cases := []struct {
		name  string
		query string
		text  string
		want  bool
	}{
		{"exact word", "chocolate", "Dark Chocolate 70%", true},
		{"substring", "choc", "Dark Chocolate 70%", true},
		{"typo in the query", "choclate", "Dark Chocolate 70%", true},
		{"typo in the text", "chocolate", "CHOCLATE MILK", true},
		{"abbreviated text", "chocolate", "CHOC NOIR", true},
		{"abbreviated shop line", "chocolate", "MILKA CHOC", true},
		{"diacritics folded", "zolty", "Żółty ser", true},
		{"polish l folded", "mleko", "MŁEKO 3,2%", true},
		{"all tokens must match", "dark choc", "Dark Beer", false},
		{"all tokens in one text", "dark choc", "Dark Chocolate", true},
		{"unrelated word chips", "choc", "Potato chips", false},
		{"unrelated word coca", "choc", "Coca Cola", false},
		{"short token is exact only", "pie", "pita", false},
		{"one letter tokens ignored", "a milk", "Milk 1L", true},
		{"empty text", "milk", "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := NewFuzzyQuery(tc.query).Matches(tc.text)
			if got != tc.want {
				t.Fatalf("query %q against %q: got %v, want %v", tc.query, tc.text, got, tc.want)
			}
		})
	}
}

func TestFuzzyQueryEmpty(t *testing.T) {
	for _, phrase := range []string{"", "   ", "a", "% !"} {
		if !NewFuzzyQuery(phrase).Empty() {
			t.Fatalf("expected %q to be an empty query", phrase)
		}
		if NewFuzzyQuery(phrase).Matches("anything") {
			t.Fatalf("an empty query must match nothing, %q matched", phrase)
		}
	}
}

func TestDamerauLevenshtein(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"milk", "milk", 0},
		{"milk", "mlik", 1},
		{"milk", "mil", 1},
		{"milk", "silk", 1},
		{"kitten", "sitting", 3},
	}
	for _, tc := range cases {
		if got := damerauLevenshtein([]rune(tc.a), []rune(tc.b), 5); got != tc.want {
			t.Fatalf("%s vs %s: got %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}
