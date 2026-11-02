package recipeimport

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/net/html"
)

// Source names where a recipe's lines came from.
const (
	SourceJSONLD    = "jsonld"
	SourceMicrodata = "microdata"
	SourceText      = "text"
)

// Recipe is what a page says about its recipe, before the ingredient lines are parsed.
type Recipe struct {
	Title    string
	Servings int // 0 when the page gave none
	Lines    []string
	Source   string
}

// ExtractRecipe finds the schema.org/Recipe on a page: JSON-LD first (single object, top-level array, @graph), then
// microdata. ok is false when the page carries no recipe ingredients.
func ExtractRecipe(page []byte) (Recipe, bool) {
	doc, err := html.Parse(bytes.NewReader(page))
	if err != nil {
		return Recipe{}, false
	}

	var scripts []string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "script" && isJSONLD(n) {
			scripts = append(scripts, nodeText(n, false))
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	fallbackTitle := pageTitle(doc)

	for _, script := range scripts {
		if recipe, ok := recipeFromJSONLD(script); ok {
			if recipe.Title == "" {
				recipe.Title = fallbackTitle
			}
			return recipe, true
		}
	}
	if recipe, ok := recipeFromMicrodata(doc); ok {
		if recipe.Title == "" {
			recipe.Title = fallbackTitle
		}
		return recipe, true
	}
	return Recipe{}, false
}

func isJSONLD(n *html.Node) bool {
	for _, a := range n.Attr {
		if a.Key == "type" {
			kind := strings.ToLower(strings.TrimSpace(strings.SplitN(a.Val, ";", 2)[0]))
			return kind == "application/ld+json"
		}
	}
	return false
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func hasToken(value, token string) bool {
	for _, field := range strings.Fields(value) {
		if strings.EqualFold(field, token) {
			return true
		}
	}
	return false
}

// nodeText joins the text under n. Script content is raw text, so entities are only decoded for elements.
func nodeText(n *html.Node, collapse bool) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	if !collapse {
		return b.String()
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

func pageTitle(doc *html.Node) string {
	var og, title string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "meta":
				if attr(n, "property") == "og:title" && og == "" {
					og = strings.TrimSpace(attr(n, "content"))
				}
			case "title":
				if title == "" {
					title = nodeText(n, true)
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	if og != "" {
		return og
	}
	return title
}

// ---- JSON-LD ----

func recipeFromJSONLD(script string) (Recipe, bool) {
	var data any
	script = strings.TrimSpace(script)
	if err := json.Unmarshal([]byte(script), &data); err != nil {
		// Raw line breaks inside strings are a common publishing slip and invalid JSON; spaces are harmless.
		cleaned := strings.Map(func(r rune) rune {
			if r < 0x20 {
				return ' '
			}
			return r
		}, script)
		if err := json.Unmarshal([]byte(cleaned), &data); err != nil {
			return Recipe{}, false
		}
	}
	for _, node := range findRecipeNodes(data) {
		if recipe, ok := recipeFromNode(node); ok {
			return recipe, true
		}
	}
	return Recipe{}, false
}

// findRecipeNodes collects every object typed Recipe in a JSON-LD value: the value itself, the elements of a
// top-level array, and the members of an @graph.
func findRecipeNodes(value any) []map[string]any {
	var found []map[string]any
	switch v := value.(type) {
	case []any:
		for _, item := range v {
			found = append(found, findRecipeNodes(item)...)
		}
	case map[string]any:
		if isRecipeType(v["@type"]) {
			found = append(found, v)
		}
		if graph, ok := v["@graph"]; ok {
			found = append(found, findRecipeNodes(graph)...)
		}
	}
	return found
}

// isRecipeType accepts "Recipe", "https://schema.org/Recipe" and arrays containing either.
func isRecipeType(value any) bool {
	matches := func(s string) bool {
		if i := strings.LastIndexAny(s, "/#"); i >= 0 {
			s = s[i+1:]
		}
		return strings.EqualFold(strings.TrimSpace(s), "Recipe")
	}
	switch t := value.(type) {
	case string:
		return matches(t)
	case []any:
		for _, item := range t {
			if s, ok := item.(string); ok && matches(s) {
				return true
			}
		}
	}
	return false
}

func recipeFromNode(node map[string]any) (Recipe, bool) {
	lines := stringList(node["recipeIngredient"])
	if len(lines) == 0 {
		lines = stringList(node["ingredients"]) // the pre-schema.org-2.0 spelling still in the wild
	}
	if len(lines) == 0 {
		return Recipe{}, false
	}
	title := ""
	if titles := stringList(node["name"]); len(titles) > 0 {
		title = cleanTitle(titles[0])
	}
	return Recipe{
		Title:    title,
		Servings: servingsFromValue(node["recipeYield"]),
		Lines:    lines,
		Source:   SourceJSONLD,
	}, true
}

// stringList reads a JSON-LD string or array of strings (a string holding several lines is split on line breaks).
func stringList(value any) []string {
	var out []string
	add := func(s string) {
		for _, line := range strings.Split(s, "\n") {
			if line = strings.TrimSpace(line); line != "" {
				out = append(out, line)
			}
		}
	}
	switch v := value.(type) {
	case string:
		add(v)
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				add(s)
			}
		}
	}
	return out
}

func cleanTitle(s string) string {
	return strings.Join(strings.Fields(decodeEntities(stripTags(s))), " ")
}

// servingsFromValue reads recipeYield, which is a number, a string ("4 porcje", "6 personnes") or an array of those.
func servingsFromValue(value any) int {
	switch v := value.(type) {
	case float64:
		return servingsFromString(strconv.FormatFloat(v, 'f', -1, 64))
	case string:
		return servingsFromString(v)
	case []any:
		for _, item := range v {
			if n := servingsFromValue(item); n > 0 {
				return n
			}
		}
	}
	return 0
}

// servingsFromString returns the first whole number from 1 to 100 in s, or 0. A yield such as "250 g" has none.
func servingsFromString(s string) int {
	rs := []rune(s)
	for i := 0; i < len(rs); {
		if !isDigit(rs[i]) {
			i++
			continue
		}
		j := i
		for j < len(rs) && isDigit(rs[j]) {
			j++
		}
		// 4.5 or 4,5 is not a count of people; skip the fractional run as a whole.
		if j+1 < len(rs) && (rs[j] == '.' || rs[j] == ',') && isDigit(rs[j+1]) {
			for j++; j < len(rs) && isDigit(rs[j]); j++ {
			}
			i = j
			continue
		}
		if n, err := strconv.Atoi(string(rs[i:j])); err == nil && n >= 1 && n <= 100 {
			return n
		}
		i = j
	}
	return 0
}

// ---- microdata ----

func recipeFromMicrodata(doc *html.Node) (Recipe, bool) {
	root := doc
	var scope *html.Node
	var find func(*html.Node)
	find = func(n *html.Node) {
		if scope != nil {
			return
		}
		if n.Type == html.ElementNode && hasAttr(n, "itemscope") {
			if strings.Contains(strings.ToLower(attr(n, "itemtype")), "schema.org/recipe") {
				scope = n
				return
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			find(c)
		}
	}
	find(doc)
	if scope != nil {
		root = scope
	}

	var lines []string
	var title string
	servings := 0
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			if prop := attr(n, "itemprop"); prop != "" {
				text := propText(n)
				switch {
				case hasToken(prop, "recipeIngredient") || hasToken(prop, "ingredients"):
					for _, line := range strings.Split(text, "\n") {
						if line = strings.TrimSpace(line); line != "" {
							lines = append(lines, line)
						}
					}
				case hasToken(prop, "recipeYield") && servings == 0:
					servings = servingsFromString(text)
				case hasToken(prop, "name") && title == "" && scope != nil:
					title = cleanTitle(text)
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	if len(lines) == 0 {
		return Recipe{}, false
	}
	return Recipe{Title: title, Servings: servings, Lines: lines, Source: SourceMicrodata}, true
}

func hasAttr(n *html.Node, key string) bool {
	for _, a := range n.Attr {
		if a.Key == key {
			return true
		}
	}
	return false
}

// propText is the value of a microdata property: its content attribute (<meta>) or its visible text.
func propText(n *html.Node) string {
	if content := attr(n, "content"); content != "" {
		return strings.TrimSpace(content)
	}
	// Keep an ingredient that spans several elements ("<span>200</span> <span>g</span> flour") on one line.
	return strings.TrimFunc(nodeText(n, true), unicode.IsSpace)
}
