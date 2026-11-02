package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/netguard"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/recipeimport"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
)

func previewRecipeForTest(t *testing.T, userId uint, groupId string, body string) *httptest.ResponseRecorder {
	t.Helper()
	w, r := shoppingListRequest("POST", body, userId, map[string]string{"groupId": groupId})
	PreviewShoppingListRecipe(w, r)
	return w
}

func importRecipeForTest(t *testing.T, userId uint, listId uint, body string) *httptest.ResponseRecorder {
	t.Helper()
	w, r := shoppingListRequest("POST", body, userId, map[string]string{"listId": fmt.Sprint(listId)})
	ImportShoppingListRecipe(w, r)
	return w
}

// withRecipeFetcher points the handlers' fetcher at a guard for the duration of a test.
func withRecipeFetcher(t *testing.T, guard netguard.Guard) {
	t.Helper()
	original := recipeImportService
	recipeImportService = func(tx *gorm.DB) services.RecipeImportService {
		service := services.NewRecipeImportService(tx)
		service.Fetcher = recipeimport.Fetcher{Guard: guard, Timeout: 2 * time.Second}
		return service
	}
	t.Cleanup(func() { recipeImportService = original })
}

func TestPreviewRecipeFromText(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	w := previewRecipeForTest(t, 1, "1", `{"text":"Na ciasto:\n• 200 g\nmąki pszennej\n2 jajka\n1,5 szklanki mleka\n2 jajka"}`)
	assertStatus(t, w, http.StatusOK)

	preview := decodeShoppingListResponse[services.RecipePreview](t, w)
	if preview.FailureReason != "" || preview.Source != recipeimport.SourceText || preview.Servings != nil {
		t.Fatalf("unexpected preview %+v", preview)
	}
	got := []string{}
	for _, item := range preview.Items {
		quantity := "-"
		if item.Quantity != nil {
			quantity = *item.Quantity
		}
		got = append(got, item.Name+"|"+quantity+"|"+item.Unit)
	}
	want := "mąki pszennej|200|g;jajka|4|;mleka|1.5|szklanki"
	if strings.Join(got, ";") != want {
		t.Errorf("items = %q, want %q", strings.Join(got, ";"), want)
	}
}

func TestPreviewRecipeNothingFoundStillSerializesAnEmptyArray(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	w := previewRecipeForTest(t, 1, "1", `{"text":"Ingredients:"}`)
	assertStatus(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), `"items":[]`) || !strings.Contains(w.Body.String(), `"failureReason":"no_ingredients"`) {
		t.Errorf("unexpected body %s", w.Body.String())
	}
}

func TestPreviewRecipeValidation(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	cases := map[string]string{
		"neither":   `{}`,
		"blank":     `{"url":"  ","text":"  "}`,
		"both":      `{"url":"https://example.com/x","text":"2 eggs"}`,
		"long url":  `{"url":"https://example.com/` + strings.Repeat("a", 3000) + `"}`,
		"long text": `{"text":"` + strings.Repeat("a", 210*1024) + `"}`,
		"huge body": `{"text":"` + strings.Repeat("a", 300*1024) + `"}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			assertStatus(t, previewRecipeForTest(t, 1, "1", body), http.StatusBadRequest)
		})
	}
}

func TestPreviewRecipeNeedsPermissionAndARealGroup(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	grantGroupPerms(t, 2, 1, permissions.GroupShoppingListsRead)
	grantAllGroupPerms(t, 4, 2)

	// Read alone cannot add items, so it cannot make the server fetch pages either.
	assertStatus(t, previewRecipeForTest(t, 2, "1", `{"text":"2 eggs"}`), http.StatusForbidden)
	// Full rights in another group do not carry over.
	assertStatus(t, previewRecipeForTest(t, 4, "1", `{"text":"2 eggs"}`), http.StatusForbidden)
	// No membership at all.
	assertStatus(t, previewRecipeForTest(t, 3, "1", `{"text":"2 eggs"}`), http.StatusForbidden)

	repositories.GetDB().Model(&models.Group{}).Where("id = ?", 1).Update("is_all_group", true)
	assertStatus(t, previewRecipeForTest(t, 1, "1", `{"text":"2 eggs"}`), http.StatusBadRequest)
}

func TestPreviewRecipeFromUrl(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	recipe := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><head><script type="application/ld+json">{"@type":"Recipe","name":"Gulasz",` +
			`"recipeYield":"4 porcje","recipeIngredient":["500 g wołowiny","2 cebule","1 łyżeczka papryki"]}</script></head></html>`))
	}))
	defer recipe.Close()

	var port uint16
	if _, err := fmt.Sscanf(recipe.URL[strings.LastIndex(recipe.URL, ":")+1:], "%d", &port); err != nil {
		t.Fatal(err)
	}
	withRecipeFetcher(t, func(addr netip.AddrPort) error {
		if addr.Addr().IsLoopback() && addr.Port() == port {
			return nil
		}
		return netguard.PublicOnly(addr)
	})

	w := previewRecipeForTest(t, 1, "1", fmt.Sprintf(`{"url":%q}`, recipe.URL))
	assertStatus(t, w, http.StatusOK)
	preview := decodeShoppingListResponse[services.RecipePreview](t, w)
	if preview.Title != "Gulasz" || preview.Servings == nil || *preview.Servings != 4 || len(preview.Items) != 3 || preview.FailureReason != "" {
		t.Errorf("unexpected preview %+v", preview)
	}

	// The same server through the production rule is an internal address: a 200 with a plain reason, no details.
	withRecipeFetcher(t, nil)
	w = previewRecipeForTest(t, 1, "1", fmt.Sprintf(`{"url":%q}`, recipe.URL))
	assertStatus(t, w, http.StatusOK)
	blocked := decodeShoppingListResponse[services.RecipePreview](t, w)
	if blocked.FailureReason != recipeimport.ReasonUnreachable || len(blocked.Items) != 0 {
		t.Errorf("unexpected blocked preview %+v", blocked)
	}
	if strings.Contains(w.Body.String(), "publicly routable") {
		t.Errorf("the answer leaks which rule refused the address: %s", w.Body.String())
	}
}

func TestPreviewRecipeUnreadableUrlsAreInlineFailuresNotErrors(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	for _, target := range []string{"ftp://example.com/x", "file:///etc/passwd", "not a url", "http://169.254.169.254/latest"} {
		t.Run(target, func(t *testing.T) {
			w := previewRecipeForTest(t, 1, "1", fmt.Sprintf(`{"url":%q}`, target))
			assertStatus(t, w, http.StatusOK)
			preview := decodeShoppingListResponse[services.RecipePreview](t, w)
			if preview.FailureReason == "" || len(preview.Items) != 0 {
				t.Errorf("unexpected preview %+v", preview)
			}
		})
	}
}

func itemsByName(list models.ShoppingList) map[string][]models.ShoppingListItem {
	out := map[string][]models.ShoppingListItem{}
	for _, item := range list.Items {
		out[strings.ToLower(item.Name)] = append(out[strings.ToLower(item.Name)], item)
	}
	return out
}

func TestImportRecipeMergesIntoTheList(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")

	addShoppingListItemForTest(t, 1, list.ID, `{"name":"Mąka","amount":"500","unit":"g"}`)
	cukier := addShoppingListItemForTest(t, 1, list.ID, `{"name":"Cukier","amount":"1","unit":"kg"}`)
	setShoppingListItemCheckedForTest(t, 1, cukier.ID, true)
	addShoppingListItemForTest(t, 1, list.ID, `{"name":"Czosnek","amount":"1"}`)
	addShoppingListItemForTest(t, 1, list.ID, `{"name":"Mleko","amount":"1","unit":"l"}`)

	hub := services.GetShoppingListHub()
	subscriber := hub.Subscribe(services.ImplicitCellID(), 1)
	defer hub.Unsubscribe(subscriber)

	w := importRecipeForTest(t, 1, list.ID, `{"items":[
		{"name":"mąka","amount":"1","unit":"kg"},
		{"name":"CUKIER","amount":"250","unit":"g"},
		{"name":"czosnek","amount":"2","unit":"ząbki"},
		{"name":"Jajka","amount":"3","unit":"szt"},
		{"name":"Sól","amount":"1.5","unit":"łyżeczka"},
		{"name":"mleko","amount":"25","unit":"cl"},
		{"name":"Pieprz"}
	]}`)
	assertStatus(t, w, http.StatusOK)

	result := decodeShoppingListResponse[services.RecipeImportResult](t, w)
	if result.Added != 4 || result.Merged != 2 || result.Revived != 1 {
		t.Errorf("counts added=%d merged=%d revived=%d, want 4/2/1", result.Added, result.Merged, result.Revived)
	}

	byName := itemsByName(result.List)
	check := func(name string, index int, amount string, unit string, quantity string, checked bool) {
		t.Helper()
		items := byName[name]
		if len(items) <= index {
			t.Fatalf("%s: expected at least %d rows, got %d", name, index+1, len(items))
		}
		item := items[index]
		gotAmount := ""
		if item.Amount != nil {
			gotAmount = item.Amount.String()
		}
		if gotAmount != amount || item.Unit != unit || item.Quantity != quantity || item.IsChecked != checked {
			t.Errorf("%s: amount=%q unit=%q quantity=%q checked=%v, want %q %q %q %v",
				name, gotAmount, item.Unit, item.Quantity, item.IsChecked, amount, unit, quantity, checked)
		}
		if item.Unit != "" && !models.IsShoppingListUnit(item.Unit) {
			t.Errorf("%s: unit %q is not one the list accepts", name, item.Unit)
		}
	}
	check("mąka", 0, "1500", "g", "", false)       // summed, kg converted into the row's grams
	check("cukier", 0, "250", "g", "", false)      // crossed off: revived and replaced, not summed
	check("mleko", 0, "1.25", "l", "", false)      // 1 l + 25 cl
	check("jajka", 0, "3", "", "", false)          // new, bare count
	check("sól", 0, "", "", "1.5 łyżeczka", false) // new, unit kept in the recipe's language as text
	check("pieprz", 0, "", "", "", false)          // new, no quantity
	if len(byName["czosnek"]) != 2 {
		t.Fatalf("czosnek: a count and \"ząbki\" cannot be summed, expected 2 rows, got %d", len(byName["czosnek"]))
	}
	check("czosnek", 0, "1", "", "", false)
	check("czosnek", 1, "", "", "2 ząbki", false)

	select {
	case event := <-subscriber.Events:
		if event.Type != models.ShoppingListEventListUpdated || event.List == nil || event.ShoppingListId != list.ID {
			t.Errorf("unexpected event %+v", event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no LIST_UPDATED event was published")
	}
	select {
	case event := <-subscriber.Events:
		t.Errorf("expected a single event, got another: %+v", event)
	default:
	}

	// A second import of the same text sums again; the text quantity is re-read, not duplicated.
	w = importRecipeForTest(t, 1, list.ID, `{"items":[{"name":"sól","amount":"0.5","unit":"łyżeczki"}]}`)
	assertStatus(t, w, http.StatusOK)
	result = decodeShoppingListResponse[services.RecipeImportResult](t, w)
	salt := itemsByName(result.List)["sól"]
	if len(salt) != 1 || salt[0].Quantity != "2 łyżeczka" {
		t.Errorf("salt after the second import: %+v", salt)
	}
}

func TestImportRecipeValidationAndPermissions(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	grantGroupPerms(t, 2, 1, permissions.GroupShoppingListsRead)
	grantAllGroupPerms(t, 4, 2)
	list := createShoppingListForTest(t, 1, "1", "Supermarket")

	bad := map[string]string{
		"no items":        `{"items":[]}`,
		"missing items":   `{}`,
		"blank name":      `{"items":[{"name":" ","amount":"1"}]}`,
		"zero amount":     `{"items":[{"name":"x","amount":"0"}]}`,
		"negative amount": `{"items":[{"name":"x","amount":"-1"}]}`,
		"huge amount":     `{"items":[{"name":"x","amount":"100000"}]}`,
		"four decimals":   `{"items":[{"name":"x","amount":"1.2345"}]}`,
		"long name":       `{"items":[{"name":"` + strings.Repeat("a", 201) + `"}]}`,
		"long unit":       `{"items":[{"name":"x","amount":"1","unit":"` + strings.Repeat("u", 51) + `"}]}`,
	}
	for name, body := range bad {
		t.Run(name, func(t *testing.T) {
			assertStatus(t, importRecipeForTest(t, 1, list.ID, body), http.StatusBadRequest)
		})
	}

	tooMany := `{"items":[` + strings.TrimSuffix(strings.Repeat(`{"name":"x"},`, 101), ",") + `]}`
	assertStatus(t, importRecipeForTest(t, 1, list.ID, tooMany), http.StatusBadRequest)

	ok := `{"items":[{"name":"Milk","amount":"1","unit":"l"}]}`
	assertStatus(t, importRecipeForTest(t, 2, list.ID, ok), http.StatusForbidden) // read only
	assertStatus(t, importRecipeForTest(t, 4, list.ID, ok), http.StatusForbidden) // another group's rights
	assertStatus(t, importRecipeForTest(t, 1, 9999, ok), http.StatusForbidden)    // unknown list answers like a denial

	if lists := getShoppingListsForTest(t, 1, "1"); len(lists[0].Items) != 0 {
		t.Errorf("a rejected import must add nothing, got %+v", lists[0].Items)
	}
}
