package recipeimport

import (
	"sort"
	"strings"
	"unicode"

	"github.com/shopspring/decimal"
)

// unitKind says how a unit behaves when a recipe is merged into a shopping list.
type unitKind int

const (
	// kindOther is a unit kept verbatim in the recipe's own language (łyżeczka, gousse, Prise, cup …).
	kindOther unitKind = iota
	// kindMetric is a weight or volume that converts exactly inside its family (g/kg/dag, ml/l/cl/dl).
	kindMetric
	// kindCount is a bare count word (szt, pcs, Stück …): the quantity alone says how many.
	kindCount
)

type unitDef struct {
	// key is what two spellings of the same unit compare as ("łyżki" and "łyżka" are both "łyżka").
	key     string
	kind    unitKind
	family  string          // metric only: "mass" or "volume"
	factor  decimal.Decimal // metric only: how many base units (g or ml) one of this unit is
	aliases []string
}

func metric(key, family string, factor int64, aliases ...string) unitDef {
	return unitDef{key: key, kind: kindMetric, family: family, factor: decimal.NewFromInt(factor), aliases: aliases}
}

func milli(key string, aliases ...string) unitDef {
	return unitDef{key: key, kind: kindMetric, family: "mass", factor: decimal.New(1, -3), aliases: aliases}
}

func other(key string, aliases ...string) unitDef {
	return unitDef{key: key, kind: kindOther, aliases: aliases}
}

func count(key string, aliases ...string) unitDef {
	return unitDef{key: key, kind: kindCount, aliases: aliases}
}

// unitDefs is the whole vocabulary. It is deliberately a plain table: a recipe in a language not listed here still
// imports, its unit simply stays part of the ingredient name. Units are never translated.
var unitDefs = []unitDef{
	// metric (the units the shopping list stores as a structured amount)
	metric("g", "mass", 1, "g", "gr", "gram", "grams", "gramm", "gramme", "grammes", "gramy", "gramów", "gramów"),
	metric("kg", "mass", 1000, "kg", "kilo", "kilos", "kilogram", "kilograms", "kilogramm", "kilogramme", "kilogrammes", "kilogramy", "kilogramów"),
	metric("dag", "mass", 10, "dag", "dkg", "deka", "dekagram", "dekagramy", "dekagramów"),
	milli("mg", "mg", "milligram", "milligrams", "miligram", "miligramy"),
	metric("ml", "volume", 1, "ml", "milliliter", "milliliters", "millilitre", "millilitres", "mililitr", "mililitry", "mililitrów"),
	metric("l", "volume", 1000, "l", "liter", "liters", "litre", "litres", "litr", "litry", "litrów"),
	metric("cl", "volume", 10, "cl", "centiliter", "centiliters", "centilitre", "centilitres"),
	metric("dl", "volume", 100, "dl", "deciliter", "deciliters", "decilitre", "decilitres", "decylitr", "decylitry"),

	// bare counts
	count("szt", "szt", "sztuka", "sztuki", "sztuk", "pcs", "pc", "piece", "pieces", "stück", "stk", "st", "stuk", "pièce", "pièces", "piece", "pce", "unit", "units", "unidad", "unidades", "ud", "uds"),

	// English
	other("tsp", "tsp", "tsps", "teaspoon", "teaspoons"),
	other("tbsp", "tbsp", "tbsps", "tbs", "tablespoon", "tablespoons"),
	other("cup", "cup", "cups"),
	other("oz", "oz", "ounce", "ounces"),
	other("lb", "lb", "lbs", "pound", "pounds"),
	other("pinch", "pinch", "pinches"),
	other("dash", "dash", "dashes"),
	other("clove", "clove", "cloves"),
	other("can", "can", "cans", "tin", "tins"),
	other("jar", "jar", "jars"),
	other("pack", "pack", "packs", "package", "packages", "packet", "packets"),
	other("bunch", "bunch", "bunches"),
	other("stick", "stick", "sticks"),
	other("slice", "slice", "slices"),
	other("sprig", "sprig", "sprigs"),
	other("head", "head", "heads"),
	other("handful", "handful", "handfuls"),
	other("bottle", "bottle", "bottles"),

	// Polish
	other("opak", "opak", "opakowanie", "opakowania", "opakowań"),
	other("ząbek", "ząbek", "ząbki", "ząbków"),
	other("łyżeczka", "łyżeczka", "łyżeczki", "łyżeczek", "łyżeczkę"),
	other("łyżka", "łyżka", "łyżki", "łyżek", "łyżkę"),
	other("szklanka", "szklanka", "szklanki", "szklanek", "szklankę"),
	other("pęczek", "pęczek", "pęczki", "pęczków"),
	other("szczypta", "szczypta", "szczypty", "szczypt", "szczyptę"),
	other("garść", "garść", "garście", "garści"),
	other("plasterek", "plasterek", "plasterki", "plasterków"),
	other("puszka", "puszka", "puszki", "puszek"),
	other("słoik", "słoik", "słoiki", "słoików"),
	other("kostka", "kostka", "kostki", "kostek"),
	other("główka", "główka", "główki", "główek"),
	other("gałązka", "gałązka", "gałązki", "gałązek"),
	other("kromka", "kromka", "kromki", "kromek"),
	other("butelka", "butelka", "butelki", "butelek"),

	// French
	other("gousse", "gousse", "gousses"),
	other("cuillère à soupe", "cuillère à soupe", "cuillères à soupe", "cuillere à soupe", "cuilleres à soupe", "c. à soupe", "c à soupe", "càs", "c.à.s", "c.à s", "cuillère à s", "c. à s"),
	other("cuillère à café", "cuillère à café", "cuillères à café", "cuillere à café", "cuilleres à café", "c. à café", "c à café", "càc", "c.à.c", "c.à c", "cuillère à c", "c. à c"),
	other("cuillère", "cuillère", "cuillères", "cuillere", "cuilleres"),
	other("pincée", "pincée", "pincées", "pincee"),
	other("boîte", "boîte", "boîtes", "boite", "boites"),
	other("paquet", "paquet", "paquets"),
	other("tranche", "tranche", "tranches"),
	other("verre", "verre", "verres"),
	other("sachet", "sachet", "sachets"),
	other("botte", "botte", "bottes"),
	other("brin", "brin", "brins"),
	other("feuille", "feuille", "feuilles"),
	other("noix", "noix"),
	other("bouquet", "bouquet", "bouquets"),

	// German
	other("el", "el", "esslöffel"),
	other("tl", "tl", "teelöffel"),
	other("prise", "prise", "prisen"),
	other("bund", "bund", "bünde"),
	other("dose", "dose", "dosen"),
	other("pck", "pck", "päckchen", "packung", "packungen"),
	other("zehe", "zehe", "zehen"),
	other("tasse", "tasse", "tassen"),
	other("becher", "becher"),
	other("scheibe", "scheibe", "scheiben"),
	other("zweig", "zweig", "zweige"),
	other("msp", "msp", "messerspitze", "messerspitzen"),
	other("glas", "glas", "gläser"),
	other("flasche", "flasche", "flaschen"),
	other("kopf", "kopf", "köpfe"),

	// Spanish
	other("cucharada", "cucharada", "cucharadas", "cda", "cdas"),
	other("cucharadita", "cucharadita", "cucharaditas", "cdita", "cditas"),
	other("diente", "diente", "dientes"),
	other("pizca", "pizca", "pizcas"),
	other("taza", "taza", "tazas"),
	other("lata", "lata", "latas"),
	other("paquete", "paquete", "paquetes"),
	other("manojo", "manojo", "manojos"),
	other("rebanada", "rebanada", "rebanadas"),
}

type aliasEntry struct {
	alias string // lower-case, single spaces
	def   *unitDef
}

// aliasIndex lists every alias longest first, so "cuillère à soupe" wins over "cuillère".
var aliasIndex = buildAliasIndex()

func buildAliasIndex() []aliasEntry {
	var entries []aliasEntry
	seen := map[string]bool{}
	for i := range unitDefs {
		def := &unitDefs[i]
		for _, alias := range def.aliases {
			alias = strings.ToLower(alias)
			if seen[alias] {
				continue
			}
			seen[alias] = true
			entries = append(entries, aliasEntry{alias: alias, def: def})
		}
	}
	sort.SliceStable(entries, func(i, j int) bool {
		return len([]rune(entries[i].alias)) > len([]rune(entries[j].alias))
	})
	return entries
}

// matchUnit reads a unit at the start of s. It returns the unit as the recipe wrote it (lower-cased, metric spellings
// reduced to g/kg/ml/l/…), its definition, and the rest of s. A unit only matches as a whole word, so "l" never eats
// the start of "lime" and "el" never eats "eleven".
func matchUnit(s string) (written string, def *unitDef, rest string, ok bool) {
	runes := []rune(s)
	lower := make([]rune, len(runes))
	for i, r := range runes {
		lower[i] = unicode.ToLower(r)
	}
	for _, entry := range aliasIndex {
		n := len([]rune(entry.alias))
		if len(runes) < n || string(lower[:n]) != entry.alias {
			continue
		}
		tail := runes[n:]
		if len(tail) > 0 && (unicode.IsLetter(tail[0]) || unicode.IsDigit(tail[0])) {
			continue
		}
		// "tsp." "St." "Pck." – an abbreviation dot belongs to the unit.
		if len(tail) > 0 && tail[0] == '.' {
			tail = tail[1:]
		}
		// Kept as the recipe wrote it ("EL", "Prise"); only metric spellings are reduced to one symbol.
		written = string(runes[:n])
		if entry.def.kind == kindMetric {
			written = entry.def.key
		}
		return written, entry.def, strings.TrimLeftFunc(string(tail), unicode.IsSpace), true
	}
	return "", nil, s, false
}

// lookupUnit finds the definition of an already-extracted unit string (as the preview returns it).
func lookupUnit(unit string) *unitDef {
	unit = strings.ToLower(strings.TrimSpace(unit))
	unit = strings.TrimSuffix(unit, ".")
	for i := range aliasIndex {
		if aliasIndex[i].alias == unit {
			return aliasIndex[i].def
		}
	}
	return nil
}

// UnitKey is what two spellings of one unit compare as. An unknown unit compares as itself, lower-cased.
func UnitKey(unit string) string {
	unit = strings.ToLower(strings.TrimSpace(unit))
	if unit == "" {
		return ""
	}
	if def := lookupUnit(unit); def != nil {
		if def.kind == kindCount {
			return ""
		}
		return def.key
	}
	return unit
}
