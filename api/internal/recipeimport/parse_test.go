package recipeimport

import (
	"strings"
	"testing"
)

// show renders an ingredient as "name | quantity | unit" so a table row reads like the line it came from.
func show(ing Ingredient) string {
	q := ""
	if ing.Quantity != nil {
		q = ing.Quantity.String()
	}
	return ing.Name + " | " + q + " | " + ing.Unit
}

func showAll(items []Ingredient) []string {
	out := make([]string, len(items))
	for i, item := range items {
		out[i] = show(item)
	}
	return out
}

func TestParseLine(t *testing.T) {
	cases := []struct{ line, want string }{
		// English
		{"2 cups all-purpose flour, sifted", "all-purpose flour | 2 | cups"},
		{"1/2 tsp salt", "salt | 0.5 | tsp"},
		{"1 1/2 tbsp olive oil", "olive oil | 1.5 | tbsp"},
		{"1 can (14 oz) diced tomatoes", "diced tomatoes | 1 | can"},
		{"1 cup of milk", "milk | 1 | cup"},
		{"200g butter, softened", "butter | 200 | g"},
		{"1.5 kg potatoes", "potatoes | 1.5 | kg"},
		{"2-3 cloves garlic", "garlic | 3 | cloves"},
		{"2 to 3 large onions", "large onions | 3 | "},
		{"3 eggs", "eggs | 3 | "},
		{"salt and pepper to taste", "salt and pepper to taste |  | "},
		{"Juice of 1 lemon", "Juice of 1 lemon |  | "},
		{"2 lb. chicken thighs", "chicken thighs | 2 | lb"},
		{"1 lime", "lime | 1 | "},
		{"7up", "7up |  | "},
		{"4 large eggs (about 200 g)", "large eggs | 4 | "},

		// glyph fractions, mixed numbers, comma decimals
		{"½ cup sugar", "sugar | 0.5 | cup"},
		{"1½ cups water", "water | 1.5 | cups"},
		{"1 ½ cups water", "water | 1.5 | cups"},
		{"¼ tsp nutmeg", "nutmeg | 0.25 | tsp"},
		{"¾ cup cream", "cream | 0.75 | cup"},
		{"⅓ cup honey", "honey | 0.33 | cup"},
		{"⅔ cup honey", "honey | 0.67 | cup"},
		{"1 ⅓ cups rice", "rice | 1.33 | cups"},
		{"0,5 l mleka", "mleka | 0.5 | l"},
		{"1,5 szklanki cukru", "cukru | 1.5 | szklanki"},

		// Polish
		{"200 g mąki pszennej", "mąki pszennej | 200 | g"},
		{"2 łyżki oleju", "oleju | 2 | łyżki"},
		{"1 łyżeczka soli", "soli | 1 | łyżeczka"},
		{"3 ząbki czosnku", "czosnku | 3 | ząbki"},
		{"1 opak. makaronu", "makaronu | 1 | opak"},
		{"2 szt. cebuli", "cebuli | 2 | szt"},
		{"1 pęczek pietruszki", "pietruszki | 1 | pęczek"},
		{"5 dag sera", "sera | 5 | dag"},
		{"Mąka pszenna – 200 g", "Mąka pszenna | 200 | g"},
		{"Sól, 1 łyżeczka", "Sól | 1 | łyżeczka"},
		{"2 jajka", "jajka | 2 | "},

		// French (de / d' connectors)
		{"200 g de farine", "farine | 200 | g"},
		{"100 g d'amandes", "amandes | 100 | g"},
		{"100 g d’amandes", "amandes | 100 | g"},
		{"2 cuillères à soupe de sucre", "sucre | 2 | cuillères à soupe"},
		{"1 pincée de sel", "sel | 1 | pincée"},
		{"2 gousses d'ail", "ail | 2 | gousses"},
		{"1 cuillère à café d'huile", "huile | 1 | cuillère à café"},
		{"250 ml de lait", "lait | 250 | ml"},
		{"3 œufs", "œufs | 3 | "},

		// German
		{"2 EL Mehl", "Mehl | 2 | EL"},
		{"1 TL Salz", "Salz | 1 | TL"},
		{"1 Prise Zucker", "Zucker | 1 | Prise"},
		{"1 Bund Petersilie", "Petersilie | 1 | Bund"},
		{"1 Dose Tomaten", "Tomaten | 1 | Dose"},
		{"2 Stück Zwiebeln", "Zwiebeln | 2 | Stück"},
		{"500 g Hackfleisch", "Hackfleisch | 500 | g"},
		{"1 Pck. Vanillezucker", "Vanillezucker | 1 | Pck"},

		// a plural in brackets after a word belongs to the word; a spaced note is dropped
		{"3 große Ei(er), Größe L", "große Eier | 3 | "},
		{"1 Prise(n) Salz", "Salz | 1 | Prisen"},
		{"2 tomato(es)", "tomatoes | 2 | "},
		{"Salt (to taste)", "Salt |  | "},
		{"400 g Mehl (wer mag, kann Vollkornmehl verwenden)", "Mehl | 400 | g"},

		// Spanish
		{"2 cucharadas de aceite", "aceite | 2 | cucharadas"},
		{"1 diente de ajo", "ajo | 1 | diente"},

		// quantity only (merged with the next line by ParseLines)
		{"200 g", " | 200 | g"},
		{"2", " | 2 | "},
	}
	for _, tc := range cases {
		t.Run(tc.line, func(t *testing.T) {
			got, ok := ParseLine(tc.line)
			if !ok {
				t.Fatalf("ParseLine(%q) not ok", tc.line)
			}
			if s := show(got); s != tc.want {
				t.Errorf("ParseLine(%q) = %q, want %q", tc.line, s, tc.want)
			}
		})
	}
}

func TestParseLineRejectsEmpty(t *testing.T) {
	for _, line := range []string{"", "   ", "()", "..."} {
		if _, ok := ParseLine(line); ok {
			t.Errorf("ParseLine(%q) should not be ok", line)
		}
	}
}

func TestNormalizeLines(t *testing.T) {
	text := strings.Join([]string{
		"Ingredients:",
		"",
		"• 2 cups flour",
		"- 1 tsp salt",
		"* 3 eggs",
		"– 1 cup sugar",
		"▪ 200 g butter",
		"☐ 1 onion",
		"☑ 2 carrots",
		"✓ 1 leek",
		"[ ] 4 potatoes",
		"[x] 5 apples",
		"For the sauce:",
		"Na ciasto:",
		"   2&nbsp;tbsp   honey   ",
		"1 cup flour &amp; 1 cup sugar",
		"&frac12; cup oil",
		"1<span> cup</span> water",
		"----",
	}, "\n")
	want := []string{
		"2 cups flour",
		"1 tsp salt",
		"3 eggs",
		"1 cup sugar",
		"200 g butter",
		"1 onion",
		"2 carrots",
		"1 leek",
		"4 potatoes",
		"5 apples",
		"2 tbsp honey",
		"1 cup flour & 1 cup sugar",
		"½ cup oil",
		"1 cup water",
	}
	got := NormalizeLines(text)
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("NormalizeLines:\n got  %q\n want %q", got, want)
	}
}

func TestParseTextMergesSplitLines(t *testing.T) {
	text := "200 g\nmąki pszennej\n2\njajka\n1/2 łyżeczki\nsoli\n3 łyżki\n250 ml\nmleka"
	got := showAll(ParseText(text))
	want := []string{
		"mąki pszennej | 200 | g",
		"jajka | 2 | ",
		"soli | 0.5 | łyżeczki",
		// "3 łyżki" has nothing to merge into (the next line is itself a quantity), so it is dropped.
		"mleka | 250 | ml",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("ParseText:\n got  %q\n want %q", got, want)
	}
}

func TestParseTextFrenchGridCopy(t *testing.T) {
	got := showAll(ParseText("200 g\nde farine\n3\nœufs\n1 pincée\nde sel"))
	want := []string{"farine | 200 | g", "œufs | 3 | ", "sel | 1 | pincée"}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestConsolidate(t *testing.T) {
	text := strings.Join([]string{
		"100 g butter",
		"2 eggs",
		"1 kg flour",
		"Butter - 50 g",
		"500 g Flour",
		"1 cup butter",
		"3 eggs",
		"salt",
		"salt",
		"250 ml milk",
		"1 l Milk",
		"2 szklanki mąki",
		"1 szklanka mąki",
		"1 szt cebuli",
		"2 cebuli",
	}, "\n")
	got := showAll(Consolidate(ParseText(text)))
	want := []string{
		"butter | 150 | g",
		"eggs | 5 | ",
		"flour | 1.5 | kg",
		"butter | 1 | cup",
		"salt |  | ",
		"milk | 1250 | ml",
		"mąki | 3 | szklanki",
		"cebuli | 3 | szt",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("Consolidate:\n got  %q\n want %q", got, want)
	}
}

func TestConsolidateKeepsIncompatibleUnitsApart(t *testing.T) {
	got := Consolidate(ParseText("2 ząbki czosnku\n1 szt czosnku\n100 g masła\n1 łyżka masła"))
	if len(got) != 4 {
		t.Fatalf("expected 4 rows, got %q", showAll(got))
	}
}

func TestConsolidateNonAsciiNames(t *testing.T) {
	got := Consolidate(ParseText("1 Żurek\n2 żurek"))
	if len(got) != 1 || show(got[0]) != "Żurek | 3 | " {
		t.Errorf("got %q", showAll(got))
	}
}
