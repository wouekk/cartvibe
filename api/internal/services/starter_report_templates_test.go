package services

import (
	"strings"
	"testing"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

// Each starter template must actually run through the engine, not only validate.
func TestStarterReportTemplatesRunThroughTheEngine(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	category := loadCategory(t, makeCategory(t, "Groceries"))
	userId, groupIds := seedReportUserInGroups(t, "rpt-starter", "Household")
	createReportReceipt(t, "starter-1", userId, groupIds[0], []models.Category{category})

	for _, command := range repositories.StarterReportTemplates(groupIds[0]) {
		preview, err := NewReportService(nil).Preview(userId, command)
		if err != nil {
			t.Errorf("%s: %v", command.Name, err)
			continue
		}
		if !strings.HasPrefix(strings.TrimSpace(preview.Html), "<") {
			t.Errorf("%s: expected HTML, got %.40q", command.Name, preview.Html)
		}
	}
}
