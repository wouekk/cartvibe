package shoplogos

import (
	"sort"
	"strings"

	"cartvibe/api/internal/utils"
)

// The same matching the app's monogram does (desktop shop-logo-match.ts), so the server downloads exactly the logos
// the receipts will show.

// normalizeShopName lower-cases, folds accents and keeps letters and digits separated by single spaces.
func normalizeShopName(value string) string {
	return strings.Join(utils.FuzzyTokens(value), " ")
}

type candidate struct {
	text  string
	brand Brand
}

// buildCandidates lists every spelling of the brands, longest first, so "carrefour polska" wins over "carrefour".
func buildCandidates(list []Brand) []candidate {
	candidates := []candidate{}
	for _, brand := range list {
		for _, spelling := range append([]string{brand.Name, brand.Slug}, brand.Aliases...) {
			if text := normalizeShopName(spelling); text != "" {
				candidates = append(candidates, candidate{text: text, brand: brand})
			}
		}
	}
	sort.SliceStable(candidates, func(i, j int) bool { return len(candidates[i].text) > len(candidates[j].text) })
	return candidates
}

// matchBrand finds the brand a receipt's shop name belongs to: a spelling that is the whole name or starts it, or a
// spelling of 6+ characters inside it. Short names such as "dm" never match from the middle of a text.
func matchBrand(shopName string, candidates []candidate) (Brand, bool) {
	text := normalizeShopName(shopName)
	if text == "" {
		return Brand{}, false
	}
	padded := " " + text + " "
	for _, candidate := range candidates {
		if text == candidate.text || strings.HasPrefix(text, candidate.text+" ") {
			return candidate.brand, true
		}
		if len(candidate.text) >= 6 && strings.Contains(padded, " "+candidate.text+" ") {
			return candidate.brand, true
		}
	}
	return Brand{}, false
}

// BrandsFor lists the known brands that the given shop names belong to, once each, in the order of brands.json.
// Logo.dev's free plan pays for about 250 logos a month, so only these are downloaded, not every known brand.
func BrandsFor(shopNames []string) []Brand {
	candidates := buildCandidates(Brands())
	wanted := map[string]bool{}
	for _, name := range shopNames {
		if brand, found := matchBrand(name, candidates); found {
			wanted[brand.Slug] = true
		}
	}

	brands := []Brand{}
	for _, brand := range Brands() {
		if wanted[brand.Slug] {
			brands = append(brands, brand)
		}
	}
	return brands
}
