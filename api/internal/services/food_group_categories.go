package services

import (
	"fmt"
	"sort"
	"strings"

	"gorm.io/gorm"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
)

// foodGroupResolver ties the AI's product categories to the Manage Categories list (Phase 3 feedback):
// the categories the AI may use are the ones listed there, a category it invents is added to the list,
// an old name of a renamed category lands on the renamed one, and a switched-off category is never used.
type foodGroupResolver struct {
	tx *gorm.DB
	// byName maps every lower-case name and alias to its category.
	byName     map[string]models.Category
	categories []models.Category
}

func newFoodGroupResolver(tx *gorm.DB) (*foodGroupResolver, error) {
	categories, err := repositories.NewCategoryRepository(tx).GetAllCategories("id, name, description, skipped, aliases")
	if err != nil {
		return nil, err
	}

	resolver := &foodGroupResolver{tx: tx, byName: map[string]models.Category{}}
	for _, category := range categories {
		resolver.add(category)
	}

	return resolver, nil
}

func (resolver *foodGroupResolver) add(category models.Category) {
	resolver.categories = append(resolver.categories, category)
	resolver.byName[strings.ToLower(strings.TrimSpace(category.Name))] = category
	for _, alias := range repositories.CategoryAliases(category.Aliases) {
		key := strings.ToLower(alias)
		if _, taken := resolver.byName[key]; !taken {
			resolver.byName[key] = category
		}
	}
}

// Resolve turns what the AI wrote into the name a product is stored under. "" means Uncategorized: no
// usable answer, or the category is switched off. A name the list does not have yet is added to it.
func (resolver *foodGroupResolver) Resolve(raw string) string {
	name, _ := resolver.ResolveCategory(raw)
	return name
}

// ResolveCategory is Resolve with the category's id, which is what a product line stores; nil with "".
func (resolver *foodGroupResolver) ResolveCategory(raw string) (string, *uint) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", nil
	}

	if category, found := resolver.byName[strings.ToLower(name)]; found {
		if category.Skipped {
			return "", nil
		}
		return category.Name, &category.ID
	}

	label := foodGroupLabel(name)
	created := models.Category{Name: label}
	db := resolver.tx
	if db == nil {
		db = repositories.GetDB()
	}
	// FirstOrCreate: two receipts read at once may invent the same category.
	err := db.Where("name = ?", label).FirstOrCreate(&created).Error
	if err != nil {
		return "", nil
	}

	resolver.add(created)
	if created.Skipped {
		return "", nil
	}
	return created.Name, &created.ID
}

// PromptBlock is what the AI is told about the category list: the names to choose from, the ones it
// must not use, and the renames. Empty when the list is empty, so a new install lets the AI start it.
func (resolver *foodGroupResolver) PromptBlock() string {
	allowed := []string{}
	skipped := []string{}
	renames := []string{}
	for _, category := range resolver.categories {
		if category.Skipped {
			skipped = append(skipped, category.Name)
			continue
		}
		allowed = append(allowed, category.Name)
		for _, alias := range repositories.CategoryAliases(category.Aliases) {
			renames = append(renames, fmt.Sprintf(`"%s" instead of "%s"`, category.Name, alias))
		}
	}
	sort.Strings(allowed)
	sort.Strings(skipped)
	sort.Strings(renames)

	lines := []string{}
	if len(allowed) > 0 {
		lines = append(lines, fmt.Sprintf(`Choose "foodGroup" from these categories, spelled exactly as listed: %s. If none of them fits, use a short new category name of one to three words.`, strings.Join(allowed, ", ")))
	}
	if len(renames) > 0 {
		lines = append(lines, "Some categories were renamed. Use "+strings.Join(renames, "; ")+".")
	}
	if len(skipped) > 0 {
		lines = append(lines, fmt.Sprintf(`Never use these categories, choose another one instead: %s.`, strings.Join(skipped, ", ")))
	}

	return strings.Join(lines, "\n")
}
