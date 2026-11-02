package recipeimport

import (
	"strings"
	"testing"
)

func page(head, body string) []byte {
	return []byte("<!doctype html><html><head><title>Site title</title>" + head + "</head><body>" + body + "</body></html>")
}

func ld(json string) string {
	return `<script type="application/ld+json">` + json + `</script>`
}

func TestExtractJSONLDShapes(t *testing.T) {
	cases := map[string]struct {
		head     string
		title    string
		servings int
		lines    string
	}{
		"direct object": {
			head:     ld(`{"@context":"https://schema.org","@type":"Recipe","name":"Pancakes","recipeIngredient":["2 cups flour","1 egg"],"recipeYield":"4 porcje"}`),
			title:    "Pancakes",
			servings: 4,
			lines:    "2 cups flour|1 egg",
		},
		"graph": {
			head: ld(`{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Blog"},` +
				`{"@type":"Recipe","name":"Soup","recipeIngredient":["1 onion"],"recipeYield":["6","6 personnes"]}]}`),
			title:    "Soup",
			servings: 6,
			lines:    "1 onion",
		},
		"top-level array": {
			head:     ld(`[{"@type":"BreadcrumbList"},{"@type":"Recipe","name":"Bread","recipeIngredient":["500 g flour"],"recipeYield":8}]`),
			title:    "Bread",
			servings: 8,
			lines:    "500 g flour",
		},
		"full url type": {
			head:  ld(`{"@type":"https://schema.org/Recipe","name":"Tea","recipeIngredient":["1 tea bag"]}`),
			title: "Tea",
			lines: "1 tea bag",
		},
		"type array": {
			head:  ld(`{"@type":["Recipe","NewsArticle"],"name":"Stew","recipeIngredient":["1 kg beef"]}`),
			title: "Stew",
			lines: "1 kg beef",
		},
		"type array with full url in graph": {
			head:  ld(`{"@graph":[{"@type":["Thing","http://schema.org/Recipe"],"name":"Rice","recipeIngredient":["1 cup rice"]}]}`),
			title: "Rice",
			lines: "1 cup rice",
		},
		"second script wins when the first is not a recipe": {
			head:  ld(`{"@type":"Organization","name":"Acme"}`) + ld(`{"@type":"Recipe","name":"Jam","recipeIngredient":["1 kg plums"]}`),
			title: "Jam",
			lines: "1 kg plums",
		},
		"legacy ingredients key": {
			head:  ld(`{"@type":"Recipe","name":"Old","ingredients":["1 apple"]}`),
			title: "Old",
			lines: "1 apple",
		},
		"ingredients as one string": {
			head:  ld(`{"@type":"Recipe","name":"Mix","recipeIngredient":"1 egg\n2 cups milk"}`),
			title: "Mix",
			lines: "1 egg|2 cups milk",
		},
		"entities and raw newlines inside strings": {
			head:  ld("{\"@type\":\"Recipe\",\"name\":\"Mac &amp; Cheese\",\"recipeIngredient\":[\"1 cup\nmacaroni\"]}"),
			title: "Mac & Cheese",
			lines: "1 cup macaroni",
		},
		"title falls back to the page": {
			head:  ld(`{"@type":"Recipe","recipeIngredient":["1 egg"]}`),
			title: "Site title",
			lines: "1 egg",
		},
		"og title beats the title tag": {
			head:  `<meta property="og:title" content="Nice recipe">` + ld(`{"@type":"Recipe","recipeIngredient":["1 egg"]}`),
			title: "Nice recipe",
			lines: "1 egg",
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			got, ok := ExtractRecipe(page(tc.head, ""))
			if !ok {
				t.Fatal("no recipe found")
			}
			if got.Source != SourceJSONLD {
				t.Errorf("source = %q, want jsonld", got.Source)
			}
			if got.Title != tc.title {
				t.Errorf("title = %q, want %q", got.Title, tc.title)
			}
			if got.Servings != tc.servings {
				t.Errorf("servings = %d, want %d", got.Servings, tc.servings)
			}
			if strings.Join(got.Lines, "|") != tc.lines {
				t.Errorf("lines = %q, want %q", got.Lines, tc.lines)
			}
		})
	}
}

func TestServingsFromYield(t *testing.T) {
	cases := map[string]int{
		"4 porcje":            4,
		"6 personnes":         6,
		"Serves 12":           12,
		"4":                   4,
		"Makes 24 cookies":    24,
		"100":                 100,
		"101":                 0,
		"0":                   0,
		"250 g":               0,
		"4.5 cups":            0,
		"2 loaves, 8 slices":  2,
		"1000 ml, 4 servings": 4,
		"":                    0,
		"a few":               0,
	}
	for in, want := range cases {
		t.Run(in, func(t *testing.T) {
			if got := servingsFromString(in); got != want {
				t.Errorf("servingsFromString(%q) = %d, want %d", in, got, want)
			}
		})
	}
	if got := servingsFromValue(float64(6)); got != 6 {
		t.Errorf("numeric yield = %d, want 6", got)
	}
}

func TestExtractMicrodata(t *testing.T) {
	body := `<div itemscope itemtype="http://schema.org/Recipe">
		<h1 itemprop="name">Gulasz</h1>
		<span itemprop="recipeYield">4 porcje</span>
		<ul>
			<li itemprop="recipeIngredient">500 g <b>wołowiny</b></li>
			<li itemprop="ingredients">2 cebule</li>
		</ul>
	</div>
	<div itemscope itemtype="http://schema.org/Recipe"><li itemprop="recipeIngredient">from another recipe</li></div>`
	got, ok := ExtractRecipe(page("", body))
	if !ok {
		t.Fatal("no recipe found")
	}
	if got.Source != SourceMicrodata || got.Title != "Gulasz" || got.Servings != 4 {
		t.Errorf("got %+v", got)
	}
	if strings.Join(got.Lines, "|") != "500 g wołowiny|2 cebule" {
		t.Errorf("lines = %q", got.Lines)
	}
}

func TestExtractMicrodataWithoutScopeAndMetaYield(t *testing.T) {
	body := `<meta itemprop="recipeYield" content="6 personnes"><p itemprop="recipeIngredient">200 g de farine</p>`
	got, ok := ExtractRecipe(page("", body))
	if !ok || got.Servings != 6 || len(got.Lines) != 1 || got.Title != "Site title" {
		t.Errorf("got %+v ok=%v", got, ok)
	}
}

func TestExtractPrefersJSONLDOverMicrodata(t *testing.T) {
	got, ok := ExtractRecipe(page(
		ld(`{"@type":"Recipe","name":"LD","recipeIngredient":["1 egg"]}`),
		`<p itemprop="recipeIngredient">2 apples</p>`,
	))
	if !ok || got.Source != SourceJSONLD {
		t.Errorf("got %+v ok=%v", got, ok)
	}
}

func TestExtractNoRecipe(t *testing.T) {
	cases := map[string][]byte{
		"plain page":           page("", "<p>Hello</p>"),
		"recipe without lines": page(ld(`{"@type":"Recipe","name":"Empty"}`), ""),
		"broken json":          page(ld(`{"@type":"Recipe",`), ""),
		"other script type":    page(`<script type="text/javascript">{"@type":"Recipe","recipeIngredient":["1 egg"]}</script>`, ""),
		"empty":                {},
	}
	for name, content := range cases {
		t.Run(name, func(t *testing.T) {
			if got, ok := ExtractRecipe(content); ok {
				t.Errorf("unexpected recipe %+v", got)
			}
		})
	}
}

func TestExtractedLinesParse(t *testing.T) {
	got, _ := ExtractRecipe(page(ld(`{"@type":"Recipe","recipeIngredient":["200 g","mąki pszennej","2 jajka"]}`), ""))
	items := ParseLines(NormalizeLines(strings.Join(got.Lines, "\n")))
	want := "mąki pszennej | 200 | g;jajka | 2 | "
	if strings.Join(showAll(items), ";") != want {
		t.Errorf("got %q", showAll(items))
	}
}
