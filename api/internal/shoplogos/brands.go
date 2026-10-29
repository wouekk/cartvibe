// Package shoplogos keeps the household's shop logos on the server: the brands CartVibe knows (brands.json), the
// files downloaded for them from Logo.dev's API into data/shop-logos, and the sync that fetches and refreshes them.
//
// Logos are downloaded through Logo.dev's API with the household's secret key, which every Logo.dev plan allows for
// self-hosting; copying them from Logo.dev's image CDN is not allowed, and nothing is bundled with the app.
package shoplogos

import (
	_ "embed"
	"encoding/json"
)

// Brand is a shop or service whose logo CartVibe can show next to a receipt.
type Brand struct {
	// Slug is the brand's stable id and its file name.
	Slug string `json:"slug"`
	Name string `json:"name"`
	// Domain is where Logo.dev finds the logo.
	Domain string `json:"domain"`
	// Aliases are extra spellings seen on receipts, matched as whole words in the browser.
	Aliases []string `json:"aliases"`
}

//go:embed brands.json
var brandsJSON []byte

var (
	brands []Brand
	bySlug map[string]Brand
)

func init() {
	if err := json.Unmarshal(brandsJSON, &brands); err != nil {
		panic("shoplogos: brands.json is not valid: " + err.Error())
	}
	bySlug = make(map[string]Brand, len(brands))
	for index, brand := range brands {
		if brand.Aliases == nil {
			brands[index].Aliases = []string{}
		}
		bySlug[brand.Slug] = brands[index]
	}
}

// Brands lists every known brand, in the order of brands.json.
func Brands() []Brand {
	return brands
}

// BrandBySlug finds a known brand. Only known slugs ever become file names.
func BrandBySlug(slug string) (Brand, bool) {
	brand, found := bySlug[slug]
	return brand, found
}
