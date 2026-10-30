package repositories

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"testing"
	"time"
)

func TestRemoveApiKeysMigrationDropsTheOldTablesAndTaskRows(t *testing.T) {
	defer TruncateTestDb()
	db := GetDB()

	if err := db.Exec("CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY)").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE TABLE IF NOT EXISTS peppers (id INTEGER PRIMARY KEY)").Error; err != nil {
		t.Fatal(err)
	}

	keep := models.SystemTask{Type: models.QUICK_SCAN, Status: models.SYSTEM_TASK_SUCCEEDED, AssociatedEntityType: models.NOOP_ENTITY_TYPE, StartedAt: time.Now()}
	gone := models.SystemTask{Type: models.QUICK_SCAN, Status: models.SYSTEM_TASK_SUCCEEDED, AssociatedEntityType: models.NOOP_ENTITY_TYPE, StartedAt: time.Now()}
	if err := db.Create(&keep).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&gone).Error; err != nil {
		t.Fatal(err)
	}
	// The model refuses the retired type, so mark the row with SQL, as an old database would hold it.
	if err := db.Exec("UPDATE system_tasks SET type = ?, associated_entity_type = ? WHERE id = ?", "API_KEY_DELETED", "API_KEY", gone.ID).Error; err != nil {
		t.Fatal(err)
	}

	role := models.AppRole{Name: "api key migration test"}
	if err := db.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	grants := []models.AppRolePermission{
		{AppRoleID: role.ID, Permission: "app.api-keys.read"},
		{AppRoleID: role.ID, Permission: "app.api-keys.delete-any"},
		{AppRoleID: role.ID, Permission: "app.users.read"},
	}
	if err := db.Create(&grants).Error; err != nil {
		t.Fatal(err)
	}

	if err := runRemoveApiKeysMigration(db); err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	var permissionsLeft []string
	if err := db.Model(&models.AppRolePermission{}).Pluck("permission", &permissionsLeft).Error; err != nil {
		t.Fatal(err)
	}
	if len(permissionsLeft) != 1 || permissionsLeft[0] != "app.users.read" {
		utils.PrintTestError(t, permissionsLeft, []string{"app.users.read"})
	}

	if db.Migrator().HasTable("api_keys") || db.Migrator().HasTable("peppers") {
		t.Error("expected the api_keys and peppers tables to be dropped")
	}

	var remaining []uint
	if err := db.Model(&models.SystemTask{}).Pluck("id", &remaining).Error; err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 1 || remaining[0] != keep.ID {
		utils.PrintTestError(t, remaining, []uint{keep.ID})
	}

	// A second run, on a database that is already clean, is harmless.
	if err := runRemoveApiKeysMigration(db); err != nil {
		utils.PrintTestError(t, err, nil)
	}
}
