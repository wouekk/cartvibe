package handlers

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"strings"
	"testing"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"
)

// Categories and tags on receipt product lines (item-level labels).

func seedLabels(t *testing.T) (models.Category, models.Category, models.Tag, models.Tag) {
	t.Helper()
	dairy := models.Category{Name: "Nabiał"}
	sweets := models.Category{Name: "Słodycze"}
	party := models.Tag{Name: "Party", ShowOnDashboard: true}
	kids := models.Tag{Name: "Kids"}
	for _, row := range []any{&dairy, &sweets, &party, &kids} {
		if err := repositories.GetDB().Create(row).Error; err != nil {
			t.Fatalf("seed label: %v", err)
		}
	}
	return dairy, sweets, party, kids
}

func TestReceiptProductCarriesOneCategoryAndManyTags(t *testing.T) {
	defer tearDownReceiptProductsTest()
	repositories.CreateTestGroupWithUsers()
	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsUpdate)
	receipt := seedProductReceipt(t, 1, false)
	dairy, sweets, party, kids := seedLabels(t)
	receiptParams := map[string]string{"receiptId": fmt.Sprint(receipt.ID)}

	body := fmt.Sprintf(`{"name":"Milk","amount":"1.09","categoryId":%d,"tagIds":[%d,%d,%d]}`, dairy.ID, party.ID, kids.ID, party.ID)
	w, r := shoppingListRequest("POST", body, 1, receiptParams)
	AddReceiptProduct(w, r)
	assertStatus(t, w, http.StatusOK)
	added := decodeShoppingListResponse[models.ReceiptProduct](t, w)
	if added.CategoryId == nil || *added.CategoryId != dairy.ID || added.FoodGroup != "Nabiał" || !added.CategoryOverridden {
		t.Errorf("expected the dairy category, chosen by a person: %+v", added)
	}
	// Repeats are dropped; the tags come back by name.
	if len(added.Tags) != 2 || added.Tags[0].Name != "Kids" || added.Tags[1].Name != "Party" {
		t.Errorf("expected the tags Kids and Party, got %+v", added.Tags)
	}

	productParams := map[string]string{"productId": fmt.Sprint(added.ID)}

	// An update replaces both: another category, no tags.
	body = fmt.Sprintf(`{"name":"Milk","amount":"1.09","categoryId":%d,"tagIds":[]}`, sweets.ID)
	w, r = shoppingListRequest("PUT", body, 1, productParams)
	UpdateReceiptProduct(w, r)
	assertStatus(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), `"tags":[]`) {
		t.Errorf("tags must serialize as [], got %s", w.Body.String())
	}
	updated := decodeShoppingListResponse[models.ReceiptProduct](t, w)
	if updated.CategoryId == nil || *updated.CategoryId != sweets.ID || updated.FoodGroup != "Słodycze" {
		t.Errorf("expected the sweets category, got %+v", updated)
	}

	// No category is Uncategorized.
	w, r = shoppingListRequest("PUT", `{"name":"Milk","amount":"1.09"}`, 1, productParams)
	UpdateReceiptProduct(w, r)
	assertStatus(t, w, http.StatusOK)
	cleared := decodeShoppingListResponse[models.ReceiptProduct](t, w)
	if cleared.CategoryId != nil || cleared.FoodGroup != "" {
		t.Errorf("expected no category, got %+v", cleared)
	}

	// Ids that do not exist are a 400, not a 500 or a silent drop.
	w, r = shoppingListRequest("PUT", `{"name":"Milk","categoryId":9999}`, 1, productParams)
	UpdateReceiptProduct(w, r)
	assertStatus(t, w, http.StatusBadRequest)
	w, r = shoppingListRequest("PUT", fmt.Sprintf(`{"name":"Milk","tagIds":[%d,9999]}`, party.ID), 1, productParams)
	UpdateReceiptProduct(w, r)
	assertStatus(t, w, http.StatusBadRequest)

	// Deleting the line removes its tag links (the join table has foreign keys).
	body = fmt.Sprintf(`{"name":"Milk","tagIds":[%d]}`, party.ID)
	w, r = shoppingListRequest("PUT", body, 1, productParams)
	UpdateReceiptProduct(w, r)
	assertStatus(t, w, http.StatusOK)
	w, r = shoppingListRequest("DELETE", "", 1, productParams)
	DeleteReceiptProduct(w, r)
	assertStatus(t, w, http.StatusOK)
	var links int64
	repositories.GetDB().Table("receipt_product_tags").Count(&links)
	if links != 0 {
		t.Errorf("expected no tag links left, got %d", links)
	}
}

func TestRenamingAProductKeepsTheCategoryAPersonChose(t *testing.T) {
	defer tearDownReceiptProductsTest()
	repositories.CreateTestGroupWithUsers()
	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsUpdate)
	receipt := seedProductReceipt(t, 1, false)
	dairy, sweets, _, _ := seedLabels(t)

	// The AI's category: a rename sends the line back to be classified, category included.
	byAi := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "LAIT", DisplayName: "Milk", CategoryId: &dairy.ID}
	byAi.FoodGroup = dairy.Name
	// A person's category: kept through a rename.
	byPerson := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "CHOCO", DisplayName: "Chocolate", CategoryId: &sweets.ID, CategoryOverridden: true}
	byPerson.FoodGroup = sweets.Name
	repositories.GetDB().Create(&byAi)
	repositories.GetDB().Create(&byPerson)

	w, r := shoppingListRequest("PUT", fmt.Sprintf(`{"name":"Oat drink","categoryId":%d}`, dairy.ID), 1, map[string]string{"productId": fmt.Sprint(byAi.ID)})
	UpdateReceiptProduct(w, r)
	assertStatus(t, w, http.StatusOK)
	if renamed := decodeShoppingListResponse[models.ReceiptProduct](t, w); renamed.CategoryId != nil || renamed.CategoryOverridden {
		t.Errorf("the AI's category should go with a rename: %+v", renamed)
	}

	w, r = shoppingListRequest("PUT", fmt.Sprintf(`{"name":"Dark chocolate","categoryId":%d}`, sweets.ID), 1, map[string]string{"productId": fmt.Sprint(byPerson.ID)})
	UpdateReceiptProduct(w, r)
	assertStatus(t, w, http.StatusOK)
	if renamed := decodeShoppingListResponse[models.ReceiptProduct](t, w); renamed.CategoryId == nil || *renamed.CategoryId != sweets.ID {
		t.Errorf("a person's category should survive a rename: %+v", renamed)
	}
}

func callGetOverviewProducts(userId uint, groupId string, query string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/overview/group/"+groupId+"/products?"+query, nil)

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("groupId", groupId)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, chiContext))
	r = r.WithContext(context.WithValue(
		r.Context(),
		jwtmiddleware.ContextKey{},
		&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: userId}},
	))

	GetOverviewProducts(w, r)
	return w
}

func seedLabelledProduct(t *testing.T, receiptId uint, amount string, category *models.Category, tags ...models.Tag) models.ReceiptProduct {
	t.Helper()
	value := decimal.RequireFromString(amount)
	product := models.ReceiptProduct{ReceiptId: receiptId, Name: "line " + amount, Amount: &value, Tags: tags}
	if category != nil {
		product.CategoryId = &category.ID
		product.FoodGroup = category.Name
	}
	if err := repositories.GetDB().Omit("Tags.*").Create(&product).Error; err != nil {
		t.Fatalf("seed product: %v", err)
	}
	return product
}

func TestGroupOverviewSplitsCategoriesByLineAndSumsTagTiles(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	dairy, sweets, party, kids := seedLabels(t)

	october := seedOverviewReceipt(t, "2026-10-03", "20.00", models.RESOLVED)
	seedLabelledProduct(t, october.ID, "3.00", &dairy, party)
	seedLabelledProduct(t, october.ID, "5.00", &sweets, party, kids)
	seedLabelledProduct(t, october.ID, "2.00", &dairy)
	// The previous month, for the tile's comparison.
	september := seedOverviewReceipt(t, "2026-09-12", "4.00", models.RESOLVED)
	seedLabelledProduct(t, september.ID, "4.00", &sweets, party)

	// A rename shows at once, whatever name the line still carries.
	repositories.GetDB().Model(&models.Category{}).Where("id = ?", dairy.ID).Update("name", "Dairy")

	w := callGetGroupOverview(1, "1", "2026-10")
	assertStatus(t, w, http.StatusOK)
	overview := decodeGroupOverview(t, w)

	totals := map[string]string{}
	for _, category := range overview.Categories {
		totals[category.Name] = category.Total.String()
		if category.Name == "Dairy" && (category.CategoryId == nil || *category.CategoryId != dairy.ID) {
			t.Errorf("the Dairy slice should carry its id: %+v", category)
		}
		if category.Name == "Uncategorized" && category.CategoryId != nil {
			t.Errorf("Uncategorized has no id: %+v", category)
		}
	}
	if totals["Dairy"] != "5" || totals["Słodycze"] != "5" || totals["Uncategorized"] != "10" {
		t.Errorf("unexpected category split %v", totals)
	}

	// Only tags marked for the Dashboard get a tile; a line counts toward each of its tags.
	if len(overview.Tags) != 1 || overview.Tags[0].TagId != party.ID || overview.Tags[0].Name != "Party" {
		t.Fatalf("expected one Party tile, got %+v", overview.Tags)
	}
	if overview.Tags[0].Total.String() != "8" || overview.Tags[0].PreviousTotal.String() != "4" {
		t.Errorf("expected Party 8 (previous 4), got %+v", overview.Tags[0])
	}

	// The tile's tap-through lists the lines behind it.
	w = callGetOverviewProducts(1, "1", fmt.Sprintf("kind=TAG&tagId=%d&month=2026-10", party.ID))
	assertStatus(t, w, http.StatusOK)
	if lines := decodeShoppingListResponse[[]structs.GroupOverviewProduct](t, w); len(lines) != 2 {
		t.Errorf("expected the two Party lines, got %+v", lines)
	}
	w = callGetOverviewProducts(1, "1", fmt.Sprintf("kind=FOODGROUP&categoryId=%d&month=2026-10", dairy.ID))
	assertStatus(t, w, http.StatusOK)
	if lines := decodeShoppingListResponse[[]structs.GroupOverviewProduct](t, w); len(lines) != 2 {
		t.Errorf("expected the two dairy lines, got %+v", lines)
	}
	w = callGetOverviewProducts(1, "1", "kind=TAG&month=2026-10")
	assertStatus(t, w, http.StatusBadRequest)
	_ = kids
}

func TestGroupOverviewTagTilesAreAnArrayWhenNoneAreShown(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	w := callGetGroupOverview(1, "1", "2026-10")
	assertStatus(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), `"tags":[]`) {
		t.Errorf("tags must serialize as [], got %s", w.Body.String())
	}
}

func TestSettingLabelsNeverRenamesTheLine(t *testing.T) {
	defer tearDownReceiptProductsTest()
	repositories.CreateTestGroupWithUsers()
	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsUpdate)
	receipt := seedProductReceipt(t, 1, false)
	dairy, _, party, kids := seedLabels(t)

	// Read by the AI: printed "LAIT", shown "Milk", rated healthy, on the list.
	planned := true
	product := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "LAIT", DisplayName: "Milk", Planned: &planned}
	product.Health = models.HEALTH_HEALTHY
	repositories.GetDB().Create(&product)
	params := map[string]string{"productId": fmt.Sprint(product.ID)}

	body := fmt.Sprintf(`{"categoryId":%d,"tagIds":[%d,%d]}`, dairy.ID, kids.ID, party.ID)
	w, r := shoppingListRequest("PUT", body, 1, params)
	SetReceiptProductLabels(w, r)
	assertStatus(t, w, http.StatusOK)
	labelled := decodeShoppingListResponse[models.ReceiptProduct](t, w)
	if labelled.Name != "LAIT" || labelled.DisplayName != "Milk" || labelled.Health != models.HEALTH_HEALTHY || labelled.Planned == nil {
		t.Errorf("labels must not rename or reclassify the line: %+v", labelled)
	}
	if labelled.CategoryId == nil || *labelled.CategoryId != dairy.ID || !labelled.CategoryOverridden || len(labelled.Tags) != 2 {
		t.Errorf("expected the dairy category and two tags: %+v", labelled)
	}

	w, r = shoppingListRequest("PUT", `{"tagIds":[9999]}`, 1, params)
	SetReceiptProductLabels(w, r)
	assertStatus(t, w, http.StatusBadRequest)

	// Read access is not enough, and an unknown id answers the same 403.
	repositories.TruncateTestDb()
	repositories.CreateTestGroupWithUsers()
	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsRead)
	receipt = seedProductReceipt(t, 1, false)
	product = models.ReceiptProduct{ReceiptId: receipt.ID, Name: "LAIT"}
	repositories.GetDB().Create(&product)
	for _, id := range []string{fmt.Sprint(product.ID), "9999"} {
		w, r = shoppingListRequest("PUT", `{"tagIds":[]}`, 1, map[string]string{"productId": id})
		SetReceiptProductLabels(w, r)
		assertStatus(t, w, http.StatusForbidden)
	}
}
