package repositories

import (
	"testing"

	"receipt-wrangler/api/internal/models"
)

func TestStarterReportTemplatesAreValid(t *testing.T) {
	templates := StarterReportTemplates(3)
	if len(templates) != 3 {
		t.Fatalf("expected 3 starter templates, got %d", len(templates))
	}

	for _, command := range templates {
		if validation := command.Validate(); len(validation.Errors) > 0 {
			t.Errorf("%s is not a valid report: %v", command.Name, validation.Errors)
		}
		if len(command.GroupIds) != 1 || command.GroupIds[0] != "3" {
			t.Errorf("%s should cover the group it was made for, got %v", command.Name, command.GroupIds)
		}
	}
}

func TestSeedStarterReportTemplatesCreatesThemOnceAndOnlyWhenThereIsAHousehold(t *testing.T) {
	defer TruncateTestDb()

	// No account or group yet: nothing is created, and nothing is recorded, so a later boot tries again.
	if err := SeedStarterReportTemplates(); err != nil {
		t.Fatal(err)
	}
	var count int64
	GetDB().Model(&models.ReportTemplate{}).Count(&count)
	if count != 0 {
		t.Fatalf("expected no templates without a household, got %d", count)
	}

	CreateTestGroupWithUsers()
	if err := SeedStarterReportTemplates(); err != nil {
		t.Fatal(err)
	}
	GetDB().Model(&models.ReportTemplate{}).Count(&count)
	if count != 3 {
		t.Fatalf("expected 3 starter templates, got %d", count)
	}

	// Deleting one is not undone by the next boot.
	GetDB().Where("name = ?", "Spending by shop").Delete(&models.ReportTemplate{})
	if err := SeedStarterReportTemplates(); err != nil {
		t.Fatal(err)
	}
	GetDB().Model(&models.ReportTemplate{}).Count(&count)
	if count != 2 {
		t.Errorf("a deleted starter template should stay deleted, got %d templates", count)
	}
}
