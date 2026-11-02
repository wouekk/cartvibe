package recipeimport

import (
	"html"
	"strings"
	"unicode"
)

// maxLineRunes keeps a pasted paragraph from becoming an "ingredient".
const maxLineRunes = 300

// bulletRunes open a list line and carry no meaning ("• 2 eggs", "☐ butter", "- 1 cup").
const bulletRunes = "•·▪▫◦●○■□☐☑☒✓✔✗✘*-–—‣⁃"

// stripTags removes anything that looks like an HTML tag (some sites leave <span>s inside ingredient strings).
func stripTags(s string) string {
	if !strings.Contains(s, "<") {
		return s
	}
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
			b.WriteRune(' ')
		case r == '>' && inTag:
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// decodeEntities decodes HTML entities, twice at most (feeds often double-encode: "&amp;frac12;").
func decodeEntities(s string) string {
	for i := 0; i < 2 && strings.Contains(s, "&"); i++ {
		decoded := html.UnescapeString(s)
		if decoded == s {
			break
		}
		s = decoded
	}
	return s
}

// cleanLine decodes, strips tags, bullets and checkbox marks, and collapses spaces. It does not judge the content.
func cleanLine(s string) string {
	s = decodeEntities(stripTags(s))
	s = strings.Map(func(r rune) rune {
		switch {
		case isSpace(r), r == '\u200b', r == '\ufeff', r == '\u2009', r == '\u2007':
			return ' '
		case unicode.IsControl(r):
			return -1
		}
		return r
	}, s)
	s = strings.TrimSpace(s)
	for {
		before := s
		for _, mark := range []string{"[ ]", "[x]", "[X]", "[✓]"} {
			s = strings.TrimPrefix(s, mark)
		}
		s = strings.TrimLeftFunc(s, func(r rune) bool { return unicode.IsSpace(r) || strings.ContainsRune(bulletRunes, r) })
		if s == before {
			break
		}
	}
	return strings.Join(strings.Fields(s), " ")
}

// isSectionHeader reports a sub-heading such as "For the sauce:" or "Na ciasto:".
func isSectionHeader(line string) bool {
	return strings.HasSuffix(line, ":") || strings.HasSuffix(line, "：")
}

// NormalizeLines splits text into cleaned ingredient candidates: one per line, entities decoded, bullets and
// checkboxes removed, blank lines and section headers dropped.
func NormalizeLines(text string) []string {
	text = strings.NewReplacer("\r\n", "\n", "\r", "\n", "\u2028", "\n", "\u2029", "\n").Replace(text)
	var lines []string
	for _, raw := range strings.Split(text, "\n") {
		line := cleanLine(raw)
		if line == "" || isSectionHeader(line) {
			continue
		}
		if len([]rune(line)) > maxLineRunes {
			continue
		}
		if !strings.ContainsFunc(line, unicode.IsLetter) && !strings.ContainsFunc(line, unicode.IsDigit) {
			continue
		}
		lines = append(lines, line)
	}
	return lines
}

// ParseLines parses cleaned lines. A line holding only a quantity (and unit) — what copying from a table gives
// ("200 g" above "mąki pszennej") — is merged with the line that follows it; one with nothing to merge into is dropped.
func ParseLines(lines []string) []Ingredient {
	var out []Ingredient
	for i := 0; i < len(lines); i++ {
		ing, ok := ParseLine(lines[i])
		if !ok {
			continue
		}
		if ing.Name != "" {
			out = append(out, ing)
			continue
		}
		if i+1 >= len(lines) {
			continue
		}
		next, ok := ParseLine(lines[i+1])
		if !ok || next.Name == "" || next.Quantity != nil {
			continue
		}
		if merged, ok := ParseLine(lines[i] + " " + lines[i+1]); ok && merged.Name != "" {
			out = append(out, merged)
			i++
		}
	}
	return out
}

// ParseText is the pasted-text path: normalise, merge split lines, parse.
func ParseText(text string) []Ingredient {
	return ParseLines(NormalizeLines(text))
}
