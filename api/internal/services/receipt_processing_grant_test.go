package services

import (
	"strings"
	"encoding/json"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"testing"
)

func TestGetCategoriesStringRestrictedToUserGrants(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	grantedCategory := makeCategory(t, "Groceries")
	makeCategory(t, "Salary")
	userId, groupId, _ := seedMemberWithGroupRoleGrants(t, "u-ai-cat", []uint{grantedCategory}, nil)

	service := ReceiptProcessingService{
		Group:  models.Group{BaseModel: models.BaseModel{ID: groupId}},
		UserId: userId,
	}

	result, err := service.getCategoriesString()
	if err != nil {
		t.Fatalf("getCategoriesString: %v", err)
	}

	var categories []models.Category
	if err := json.Unmarshal([]byte(result), &categories); err != nil {
		t.Fatalf("unmarshal categories: %v", err)
	}
	if len(categories) != 1 || categories[0].ID != grantedCategory {
		t.Errorf("expected the AI prompt to see only the granted category, got %v", categories)
	}
}

func TestGetCategoriesStringUnrestrictedForSystemProcessing(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	makeCategory(t, "Groceries")
	makeCategory(t, "Salary")

	// UserId 0 = system-initiated (e.g. email polling): no restriction.
	service := ReceiptProcessingService{}

	result, err := service.getCategoriesString()
	if err != nil {
		t.Fatalf("getCategoriesString: %v", err)
	}

	var categories []models.Category
	if err := json.Unmarshal([]byte(result), &categories); err != nil {
		t.Fatalf("unmarshal categories: %v", err)
	}
	if len(categories) != 2 {
		t.Errorf("expected all categories for system processing, got %d", len(categories))
	}
}

// The AI never assigns tags, so building the prompt never reads the household's tags (a failure to read them
// once failed the whole read).
func TestPromptVariablesCarryNoTags(t *testing.T) {
	defer repositories.TruncateTestDb()
	makeTag(t, "Reimbursable")

	result, err := ReceiptProcessingService{}.buildTemplateVariableMap("")
	if err != nil {
		t.Fatalf("buildTemplateVariableMap: %v", err)
	}
	if _, hasTags := result[structs.TAGS]; hasTags {
		t.Errorf("expected no @tags in the prompt variables, got %q", result[structs.TAGS])
	}
	if strings.Contains(DefaultReceiptPrompt, string(structs.TAGS)) {
		t.Errorf("the default prompt should not ask for @tags")
	}
}

func TestGetCategoriesStringIsCompactAndLeavesOutSwitchedOffCategories(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	makeCategory(t, "Groceries")
	skipped := models.Category{Name: "Never", Skipped: true}
	repositories.GetDB().Create(&skipped)

	result, err := ReceiptProcessingService{}.getCategoriesString()
	if err != nil {
		t.Fatalf("getCategoriesString: %v", err)
	}
	if strings.Contains(result, "Never") {
		t.Errorf("a category switched off for the AI must not be offered: %s", result)
	}
	if strings.Contains(result, "createdAt") || strings.Contains(result, "skipped") || !strings.Contains(result, `"name":"Groceries"`) {
		t.Errorf("expected only id, name and description: %s", result)
	}
}
