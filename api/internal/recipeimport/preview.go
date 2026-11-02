package recipeimport

import (
	"context"
	"errors"
	"strings"
)

// ReasonNoIngredients is the text path's "nothing here looks like an ingredient".
const ReasonNoIngredients = "no_ingredients"

// Preview is what an import shows before anything touches a shopping list.
type Preview struct {
	Title         string
	SourceURL     string
	Servings      int // 0 when unknown
	Source        string
	FailureReason string // "" when Items can be shown
	Items         []Ingredient
}

// FromText previews pasted ingredient text.
func FromText(text string) Preview {
	items := Consolidate(ParseText(text))
	preview := Preview{Source: SourceText, Items: items}
	if len(items) == 0 {
		preview.FailureReason = ReasonNoIngredients
	}
	return preview
}

// FromURL fetches a recipe page and previews its ingredients. A page that cannot be read is a Preview with a
// FailureReason, not an error: the person is guided to paste the ingredients instead.
func (f Fetcher) FromURL(ctx context.Context, rawURL string) Preview {
	page, err := f.Fetch(ctx, rawURL)
	if err != nil {
		var fetchErr *FetchError
		reason := ReasonUnreachable
		if errors.As(err, &fetchErr) {
			reason = fetchErr.Reason
		}
		return Preview{SourceURL: strings.TrimSpace(rawURL), FailureReason: reason}
	}

	preview := Preview{SourceURL: page.FinalURL}
	recipe, ok := ExtractRecipe(page.Body)
	if !ok {
		preview.FailureReason = ReasonNoRecipe
		if page.Truncated {
			preview.FailureReason = ReasonTooLarge
		}
		return preview
	}

	preview.Title = recipe.Title
	preview.Servings = recipe.Servings
	preview.Source = recipe.Source
	preview.Items = Consolidate(ParseLines(NormalizeLines(strings.Join(recipe.Lines, "\n"))))
	if len(preview.Items) == 0 {
		preview.FailureReason = ReasonNoRecipe
	}
	return preview
}
