package services

import (
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"strings"
	"testing"
	"time"
)

func TestParseClassificationResponseNormalizesValues(t *testing.T) {
	results, err := parseClassificationResponse(`{"products": [
		{"id": "1", "health": "healthy", "foodGroup": "Fresh Produce", "seasonality": "seasonal"},
		{"id": 2, "health": "VERY BAD", "foodGroup": "sweets & snacks", "seasonality": "maybe"},
		{"id": "", "health": "HEALTHY"}
	]}`)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if got := results["1"]; got.Health != models.HEALTH_HEALTHY || got.FoodGroup != "fresh produce" || got.Seasonality != models.SEASONALITY_SEASONAL {
		t.Errorf("unexpected first result %+v", got)
	}
	if got := results["2"]; got.Health != models.HEALTH_UNKNOWN || got.Seasonality != models.SEASONALITY_NOT_PRODUCE {
		t.Errorf("expected unknown values to fall back, got %+v", got)
	}
	if len(results) != 2 {
		t.Errorf("expected the id-less entry dropped, got %+v", results)
	}

	if _, err := parseClassificationResponse(`{"items": []}`); err == nil {
		t.Error("expected the wrong shape to be rejected")
	}
}

func TestClassificationBatchesSplitByGroupAndPurchaseMonth(t *testing.T) {
	september := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	candidates := []repositories.ClassificationCandidate{
		{Kind: repositories.ClassificationKindProduct, Id: 1, GroupId: 1, ReceiptDate: september},
		{Kind: repositories.ClassificationKindProduct, Id: 2, GroupId: 1, ReceiptDate: september.AddDate(0, 0, 10)},
		{Kind: repositories.ClassificationKindProduct, Id: 3, GroupId: 2, ReceiptDate: september},
		{Kind: repositories.ClassificationKindItem, Id: 4, GroupId: 1},
	}

	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	batches := buildClassificationBatches(candidates, now)
	if len(batches) != 3 {
		t.Fatalf("expected 3 batches (group 1 Sep, group 1 Oct, group 2 Sep), got %+v", batches)
	}

	sizes := map[string]int{}
	for _, batch := range batches {
		sizes[batch.month.Format("2006-01")+"/"+string(rune('0'+batch.groupId))] = len(batch.candidates)
	}
	if sizes["2026-09/1"] != 2 || sizes["2026-10/1"] != 1 || sizes["2026-09/2"] != 1 {
		t.Errorf("unexpected batches %v", sizes)
	}
}

func TestClassificationPromptCarriesMonthRegionAndCorrections(t *testing.T) {
	batch := classificationBatch{
		groupId: 1,
		month:   time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC),
		candidates: []repositories.ClassificationCandidate{
			{Name: "STRAWB 250G", DisplayName: "Strawberries 250 g"},
		},
	}

	prompt := buildClassificationPrompt(batch, map[string]string{"dark chocolate": models.HEALTH_MEDIUM})
	for _, expected := range []string{"December 2026", "Western Europe", `"name":"Strawberries 250 g"`, "dark chocolate: MEDIUM"} {
		if !strings.Contains(prompt, expected) {
			t.Errorf("expected the prompt to contain %q", expected)
		}
	}
}

func seedClassificationItem(t *testing.T, name string) models.ShoppingListItem {
	t.Helper()
	repositories.CreateTestGroupWithUsers()
	list := models.ShoppingList{GroupId: 1, Name: "Supermarket"}
	if err := repositories.GetDB().Create(&list).Error; err != nil {
		t.Fatalf("seed list: %v", err)
	}
	item := models.ShoppingListItem{ShoppingListId: list.ID, Name: name}
	if err := repositories.GetDB().Create(&item).Error; err != nil {
		t.Fatalf("seed item: %v", err)
	}
	return item
}

func reloadItem(t *testing.T, id uint) models.ShoppingListItem {
	t.Helper()
	item, err := repositories.NewShoppingListRepository(nil).GetShoppingListItemById(id)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	return item
}

func TestClassificationWaitsWithoutAnAi(t *testing.T) {
	defer repositories.TruncateTestDb()
	item := seedClassificationItem(t, "Strawberries")

	classified, err := NewFoodClassificationService(nil).ProcessPending()
	if err != nil || classified != 0 {
		t.Fatalf("expected nothing classified without an AI, got %d (%v)", classified, err)
	}

	reloaded := reloadItem(t, item.ID)
	if reloaded.ClassifiedAt != nil || reloaded.ClassificationAttempts != 0 {
		t.Errorf("expected the item still waiting and no attempt counted, got %+v", reloaded.FoodClassification)
	}
}

func TestCorrectionIsSavedAndRemembered(t *testing.T) {
	defer repositories.TruncateTestDb()
	item := seedClassificationItem(t, "  Dark  Chocolate ")

	corrected, err := NewFoodClassificationService(nil).CorrectShoppingListItem(1, item.ID, commands.SetFoodClassificationCommand{
		Health: models.HEALTH_MEDIUM,
	})
	if err != nil {
		t.Fatalf("correct: %v", err)
	}
	if corrected.Health != models.HEALTH_MEDIUM || !corrected.ClassificationOverridden || corrected.ClassifiedAt == nil {
		t.Errorf("expected the correction applied and marked, got %+v", corrected.FoodClassification)
	}

	corrections, err := repositories.NewFoodClassificationRepository(nil).CorrectionsForGroup(1)
	if err != nil {
		t.Fatalf("corrections: %v", err)
	}
	if corrections["dark chocolate"] != models.HEALTH_MEDIUM {
		t.Errorf("expected the correction remembered under its normalized name, got %v", corrections)
	}

	// A corrected item is never picked up by the sweep again.
	pending, _ := repositories.NewFoodClassificationRepository(nil).UnclassifiedItems(10)
	if len(pending) != 0 {
		t.Errorf("expected nothing pending, got %+v", pending)
	}
}

func TestRenamingAnItemClearsItsTags(t *testing.T) {
	defer repositories.TruncateTestDb()
	item := seedClassificationItem(t, "Crisps")
	service := NewFoodClassificationService(nil)
	if _, err := service.CorrectShoppingListItem(1, item.ID, commands.SetFoodClassificationCommand{Health: models.HEALTH_UNHEALTHY}); err != nil {
		t.Fatalf("correct: %v", err)
	}

	// Same product, different spelling: tags kept.
	if _, err := NewShoppingListService(nil).UpdateShoppingListItem(1, item.ID, commands.UpsertShoppingListItemCommand{Name: "crisps"}); err != nil {
		t.Fatalf("update: %v", err)
	}
	if reloadItem(t, item.ID).Health != models.HEALTH_UNHEALTHY {
		t.Error("a change of case must not clear the tags")
	}

	if _, err := NewShoppingListService(nil).UpdateShoppingListItem(1, item.ID, commands.UpsertShoppingListItemCommand{Name: "Apples"}); err != nil {
		t.Fatalf("update: %v", err)
	}
	reloaded := reloadItem(t, item.ID)
	if reloaded.Health != "" || reloaded.ClassifiedAt != nil || reloaded.ClassificationOverridden {
		t.Errorf("expected a renamed item to be classified afresh, got %+v", reloaded.FoodClassification)
	}
}

func TestRevivingAnItemReclassifiesItUnlessCorrected(t *testing.T) {
	defer repositories.TruncateTestDb()
	strawberries := seedClassificationItem(t, "Strawberries")
	repository := repositories.NewFoodClassificationRepository(nil)
	candidate := repositories.ClassificationCandidate{Kind: repositories.ClassificationKindItem, Id: strawberries.ID}
	if err := repository.SaveClassification(candidate, repositories.ClassificationResult{Health: models.HEALTH_HEALTHY, Seasonality: models.SEASONALITY_SEASONAL}, time.Now()); err != nil {
		t.Fatalf("classify: %v", err)
	}
	if _, err := NewShoppingListService(nil).SetShoppingListItemChecked(1, strawberries.ID, true, 1); err != nil {
		t.Fatalf("check: %v", err)
	}

	revived, err := NewShoppingListService(nil).AddShoppingListItem(1, strawberries.ShoppingListId, commands.UpsertShoppingListItemCommand{Name: "strawberries"}, 1)
	if err != nil || revived.ID != strawberries.ID {
		t.Fatalf("expected the item revived, got %+v (%v)", revived, err)
	}
	if reloaded := reloadItem(t, strawberries.ID); reloaded.ClassifiedAt != nil || reloaded.Seasonality != "" {
		t.Errorf("expected a revived item's seasonality worked out again, got %+v", reloaded.FoodClassification)
	}
}
