package repositories

import (
	"errors"
	"testing"
	"time"

	"cartvibe/api/internal/cell/celltest"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// Twin-cell tests for the repositories moved onto cell.Handle in step 2, leaf repositories first (see
// cell_handle_test.go for the fixture rules). Every test seeds the same ids into both cells, reads through
// both handles, changes one cell, and reads the other again.

func TestCategoryRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.Category{Name: "cat-" + marker}).Error
	})
	tw.RequireIdenticalIDs(t, "categories")

	repoA := NewCategoryRepository(tw.Handle(celltest.A), nil)
	repoB := NewCategoryRepository(tw.Handle(celltest.B), nil)

	categoriesA, err := repoA.GetAllCategories("*")
	if err != nil {
		t.Fatal(err)
	}
	categoriesB, err := repoB.GetAllCategories("*")
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, categoriesA)
	tw.ExpectOwn(t, celltest.B, categoriesB)

	// A write and a delete in A leave B alone, though both cells hold id 1.
	if _, err := repoA.CreateCategory(models.Category{Name: "only-in-a"}); err != nil {
		t.Fatal(err)
	}
	if err := repoA.DeleteCategory(1); err != nil {
		t.Fatal(err)
	}
	countB, err := repoB.CountByIds([]uint{1, 2})
	if err != nil {
		t.Fatal(err)
	}
	if countB != 1 {
		t.Errorf("cell B holds %d of ids 1 and 2, want exactly its own id 1", countB)
	}
	categoriesB, err = repoB.GetByIds([]uint{1})
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.B, categoriesB)

	categoriesA, err = repoA.GetAllCategories("*")
	if err != nil {
		t.Fatal(err)
	}
	if len(categoriesA) != 1 || categoriesA[0].Name != "only-in-a" {
		t.Errorf("cell A did not take its own writes: %+v", categoriesA)
	}
	tw.RejectOther(t, celltest.A, categoriesA)
}

func TestTagsRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.Tag{Name: "tag-" + marker}).Error
	})
	tw.RequireIdenticalIDs(t, "tags")

	repoA := NewTagsRepository(tw.Handle(celltest.A), nil)
	repoB := NewTagsRepository(tw.Handle(celltest.B), nil)

	tagsA, err := repoA.GetAllTags("*")
	if err != nil {
		t.Fatal(err)
	}
	tagsB, err := repoB.GetAllTags("*")
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, tagsA)
	tw.ExpectOwn(t, celltest.B, tagsB)

	if _, err := repoA.UpdateTag("1", commands.UpsertTagCommand{Name: "renamed-in-a"}); err != nil {
		t.Fatal(err)
	}
	if _, err := repoA.CreateTag(commands.UpsertTagCommand{Name: "new-in-a"}); err != nil {
		t.Fatal(err)
	}
	if err := repoA.DeleteTag(2); err != nil {
		t.Fatal(err)
	}

	tagsB, err = repoB.GetByIds([]uint{1, 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(tagsB) != 1 {
		t.Errorf("cell B should still hold only its own tag, got %+v", tagsB)
	}
	tw.ExpectOwn(t, celltest.B, tagsB)
}

func TestUserPreferencesRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := seedTwinUser(db, 1, "same-name"); err != nil {
			return err
		}
		return db.Create(&models.UserPrefernces{UserId: 1, Language: "x", DisplayCurrency: "cur-" + marker[len("marker-of-cell-"):len("marker-of-cell-")+1]}).Error
	})
	tw.RequireIdenticalIDs(t, "user_prefernces")

	repoA := NewUserPreferencesRepository(tw.Handle(celltest.A), nil)
	repoB := NewUserPreferencesRepository(tw.Handle(celltest.B), nil)

	// The marker sits in DisplayCurrency (size 8), so it is the cell letter rather than the whole marker.
	prefsA, err := repoA.GetUserPreferencesOrCreate(1)
	if err != nil {
		t.Fatal(err)
	}
	prefsB, err := repoB.GetUserPreferencesOrCreate(1)
	if err != nil {
		t.Fatal(err)
	}
	if prefsA.DisplayCurrency == prefsB.DisplayCurrency || prefsA.DisplayCurrency == "" || prefsB.DisplayCurrency == "" {
		t.Fatalf("the twin cells must hold different preferences: A=%q B=%q", prefsA.DisplayCurrency, prefsB.DisplayCurrency)
	}

	// Saving in A reaches A only.
	prefsA.DisplayCurrency = "CHF"
	prefsA.Language = "de"
	if _, err := repoA.UpdateUserPreferences(1, prefsA); err != nil {
		t.Fatal(err)
	}
	after, err := repoB.GetUserPreferencesOrCreate(1)
	if err != nil {
		t.Fatal(err)
	}
	if after.DisplayCurrency != prefsB.DisplayCurrency || after.Language != "x" {
		t.Errorf("a save in cell A changed cell B's preferences: %+v", after)
	}

	// Deleting in A leaves B's row.
	if err := repoA.DeleteUserPreferences(1); err != nil {
		t.Fatal(err)
	}
	var inB int64
	tw.Handle(celltest.B).DB().Model(&models.UserPrefernces{}).Where("user_id = 1").Count(&inB)
	if inB != 1 {
		t.Errorf("cell B lost its preferences row when cell A deleted its own: %d", inB)
	}
}

func TestShoppingListRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := db.Create(&models.Group{Name: "group-" + marker}).Error; err != nil {
			return err
		}
		if err := db.Create(&models.ShoppingList{GroupId: 1, Name: "list-" + marker}).Error; err != nil {
			return err
		}
		return db.Create(&models.ShoppingListItem{ShoppingListId: 1, Name: "item-" + marker}).Error
	})
	tw.RequireIdenticalIDs(t, "shopping_lists")
	tw.RequireIdenticalIDs(t, "shopping_list_items")

	repoA := NewShoppingListRepository(tw.Handle(celltest.A), nil)
	repoB := NewShoppingListRepository(tw.Handle(celltest.B), nil)

	listsA, err := repoA.GetShoppingListsByGroupId(1)
	if err != nil {
		t.Fatal(err)
	}
	listsB, err := repoB.GetShoppingListsByGroupId(1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, listsA)
	tw.ExpectOwn(t, celltest.B, listsB)

	itemB, err := repoB.GetShoppingListItemById(1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.B, itemB)

	// Renaming, then removing the list for the group in A, leaves B's list and item.
	if err := repoA.UpdateShoppingListName(1, "renamed-in-a"); err != nil {
		t.Fatal(err)
	}
	if err := repoA.DeleteShoppingListsForGroup(1); err != nil {
		t.Fatal(err)
	}

	listsB, err = repoB.GetShoppingListsByGroupId(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(listsB) != 1 {
		t.Fatalf("cell B lost its list: %+v", listsB)
	}
	tw.ExpectOwn(t, celltest.B, listsB)
	if len(listsB[0].Items) != 1 {
		t.Errorf("cell B lost its item: %+v", listsB[0].Items)
	}

	listsA, err = repoA.GetShoppingListsByGroupId(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(listsA) != 0 {
		t.Errorf("cell A still lists a deleted list: %+v", listsA)
	}
}

func TestSystemTaskRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.SystemTask{Type: models.QUICK_SCAN, Status: models.SYSTEM_TASK_SUCCEEDED, AssociatedEntityType: models.NOOP_ENTITY_TYPE, ResultDescription: "task-" + marker, StartedAt: time.Now()}).Error
	})
	tw.RequireIdenticalIDs(t, "system_tasks")

	repoA := NewSystemTaskRepository(tw.Handle(celltest.A), nil)
	repoB := NewSystemTaskRepository(tw.Handle(celltest.B), nil)

	taskA, err := repoA.GetSystemTaskById(1)
	if err != nil {
		t.Fatal(err)
	}
	taskB, err := repoB.GetSystemTaskById(1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, taskA)
	tw.ExpectOwn(t, celltest.B, taskB)

	// A task created in A takes id 2 there; B must not know it.
	created, err := repoA.CreateSystemTask(commands.UpsertSystemTaskCommand{Type: models.QUICK_SCAN, Status: models.SYSTEM_TASK_SUCCEEDED, AssociatedEntityType: models.NOOP_ENTITY_TYPE, ResultDescription: "created-in-a", StartedAt: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID != 2 {
		t.Fatalf("created id = %d, want 2", created.ID)
	}
	var inB int64
	tw.Handle(celltest.B).DB().Model(&models.SystemTask{}).Count(&inB)
	if inB != 1 {
		t.Errorf("cell B holds %d tasks after a create in cell A, want 1", inB)
	}

	pagedB, _, err := repoB.GetPagedSystemTasks(commands.GetSystemTaskCommand{PagedRequestCommand: commands.PagedRequestCommand{Page: 1, PageSize: 10, OrderBy: "started_at", SortDirection: commands.DESCENDING}})
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.B, pagedB)
}

func TestOidcIdentityRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := seedTwinUser(db, 1, "same-name"); err != nil {
			return err
		}
		if err := db.Create(&models.OidcProvider{Name: "idp", DisplayName: "IdP", IssuerUrl: "https://issuer.example", ClientId: "client", ClientSecret: "x"}).Error; err != nil {
			return err
		}
		return db.Create(&models.OidcIdentity{Subject: "same-subject", OidcProviderId: 1, UserId: 1, PreferredUsername: "user-" + marker}).Error
	})
	tw.RequireIdenticalIDs(t, "oidc_identities")

	repoA := NewOidcIdentityRepository(tw.Handle(celltest.A), nil)
	repoB := NewOidcIdentityRepository(tw.Handle(celltest.B), nil)

	identityA, err := repoA.GetIdentityBySubject(1, "same-subject")
	if err != nil {
		t.Fatal(err)
	}
	identityB, err := repoB.GetIdentityBySubject(1, "same-subject")
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, identityA)
	tw.ExpectOwn(t, celltest.B, identityB)

	if err := repoA.TouchIdentity(1, "touched-in-a", "a@example.com"); err != nil {
		t.Fatal(err)
	}
	if err := repoA.DeleteIdentity(1, 1); err != nil {
		t.Fatal(err)
	}

	identitiesB, err := repoB.GetIdentitiesForUser(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(identitiesB) != 1 {
		t.Fatalf("cell B lost its identity: %+v", identitiesB)
	}
	tw.ExpectOwn(t, celltest.B, identitiesB)

	countA, err := repoA.CountIdentitiesForUser(1)
	if err != nil {
		t.Fatal(err)
	}
	if countA != 0 {
		t.Errorf("cell A still counts %d identities after deleting its own", countA)
	}
}

func TestOidcProviderRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.OidcProvider{Name: "idp", DisplayName: "IdP " + marker, IssuerUrl: "https://issuer.example", ClientId: "client", ClientSecret: "x", Enabled: true}).Error
	})
	tw.RequireIdenticalIDs(t, "oidc_providers")

	repoA := NewOidcProviderRepository(tw.Handle(celltest.A), nil)
	repoB := NewOidcProviderRepository(tw.Handle(celltest.B), nil)

	providerA, err := repoA.GetOidcProviderByName("idp")
	if err != nil {
		t.Fatal(err)
	}
	providerB, err := repoB.GetOidcProviderById(1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, providerA)
	tw.ExpectOwn(t, celltest.B, providerB)

	// Deleting the provider in A leaves B's provider (same id, same name) alone.
	if err := repoA.DeleteOidcProvider(1); err != nil {
		t.Fatal(err)
	}
	enabledA, err := repoA.GetAllEnabledOidcProviders()
	if err != nil {
		t.Fatal(err)
	}
	if len(enabledA) != 0 {
		t.Errorf("cell A still lists a deleted provider: %+v", enabledA)
	}
	enabledB, err := repoB.GetAllEnabledOidcProviders()
	if err != nil {
		t.Fatal(err)
	}
	if len(enabledB) != 1 {
		t.Fatalf("cell B lost its provider: %+v", enabledB)
	}
	tw.ExpectOwn(t, celltest.B, enabledB)
}

func TestOidcSessionRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.OidcProvider{Name: "idp", DisplayName: "IdP", IssuerUrl: "https://issuer.example", ClientId: "client", ClientSecret: "x"}).Error
	})

	repoA := NewOidcSessionRepository(tw.Handle(celltest.A), nil)
	repoB := NewOidcSessionRepository(tw.Handle(celltest.B), nil)

	// The same state value exists in both cells; only A stores a session for it.
	linkUser := uint(1)
	err := repoA.CreateAuthSession(&models.OidcAuthSession{
		OidcProviderId: 1, StateHash: "same-state", NonceHash: "n", CodeVerifier: "v", LinkUserId: &linkUser, ExpiresAt: time.Now().Add(time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, claimed, err := repoB.ConsumeAuthSession("same-state"); err != nil || claimed {
		t.Fatalf("cell B claimed a session that exists only in cell A: claimed=%v err=%v", claimed, err)
	}
	routingB, err := repoB.GetPendingAuthSessionRouting("same-state")
	if err != nil || routingB.LinkUserId != nil {
		t.Errorf("cell B can read the routing of a session that exists only in cell A: %+v (err %v)", routingB, err)
	}
	if routingA, err := repoA.GetPendingAuthSessionRouting("same-state"); err != nil || routingA.LinkUserId == nil {
		t.Errorf("cell A cannot read the routing of its own session: %+v (err %v)", routingA, err)
	}

	session, claimed, err := repoA.ConsumeAuthSession("same-state")
	if err != nil || !claimed || session.OidcProviderId != 1 {
		t.Fatalf("cell A could not claim its own session: claimed=%v err=%v", claimed, err)
	}
}

func TestFoodClassificationRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.Group{Name: "group-" + marker}).Error
	})
	tw.RequireIdenticalIDs(t, "groups")

	repoA := NewFoodClassificationRepository(tw.Handle(celltest.A), nil)
	repoB := NewFoodClassificationRepository(tw.Handle(celltest.B), nil)

	if err := repoA.RememberCorrection(1, "Oat Milk", "healthy"); err != nil {
		t.Fatal(err)
	}
	if err := repoB.RememberCorrection(1, "Oat Milk", "unhealthy"); err != nil {
		t.Fatal(err)
	}

	correctionsA, err := repoA.CorrectionsForGroup(1)
	if err != nil {
		t.Fatal(err)
	}
	correctionsB, err := repoB.CorrectionsForGroup(1)
	if err != nil {
		t.Fatal(err)
	}
	if correctionsA["oat milk"] != "healthy" || correctionsB["oat milk"] != "unhealthy" {
		t.Errorf("corrections crossed cells: A=%v B=%v", correctionsA, correctionsB)
	}

	if err := repoA.DeleteCorrectionsForGroup(1); err != nil {
		t.Fatal(err)
	}
	correctionsB, err = repoB.CorrectionsForGroup(1)
	if err != nil {
		t.Fatal(err)
	}
	if correctionsB["oat milk"] != "unhealthy" {
		t.Errorf("deleting group 1's corrections in cell A removed cell B's: %v", correctionsB)
	}
}

func TestReportTemplateRepositoryAndStarterSeedStayInTheirCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := seedTwinUser(db, 1, "same-name"); err != nil {
			return err
		}
		return db.Create(&models.Group{Name: HouseholdGroupName}).Error
	})

	// Seeding B creates B's starter templates and its ledger row, and nothing in A.
	if err := SeedStarterReportTemplates(tw.Handle(celltest.B)); err != nil {
		t.Fatal(err)
	}

	count := func(w celltest.Which, model any) int64 {
		var n int64
		tw.Handle(w).DB().Model(model).Count(&n)
		return n
	}
	if got := count(celltest.A, &models.ReportTemplate{}); got != 0 {
		t.Errorf("seeding cell B created %d templates in cell A", got)
	}
	if got := count(celltest.A, &models.DataMigration{}); got != 0 {
		t.Errorf("seeding cell B wrote %d ledger rows in cell A", got)
	}
	if got := count(celltest.B, &models.ReportTemplate{}); got != 3 {
		t.Errorf("cell B holds %d starter templates, want 3", got)
	}

	// The ledger is per cell: A still seeds its own after B has been seeded.
	if err := SeedStarterReportTemplates(tw.Handle(celltest.A)); err != nil {
		t.Fatal(err)
	}
	if got := count(celltest.A, &models.ReportTemplate{}); got != 3 {
		t.Errorf("cell A holds %d starter templates after its own seed, want 3", got)
	}

	// Reads stay in their cell: delete one in A, B keeps all three.
	repoA := NewReportTemplateRepository(tw.Handle(celltest.A), nil)
	repoB := NewReportTemplateRepository(tw.Handle(celltest.B), nil)
	if err := repoA.DeleteReportTemplateById("1"); err != nil {
		t.Fatal(err)
	}
	if _, err := repoB.GetReportTemplateById("1"); err != nil {
		t.Errorf("cell B lost template 1 when cell A deleted its own: %v", err)
	}
	if _, err := repoA.GetReportTemplateById("1"); err == nil {
		t.Error("cell A still reads a template it deleted")
	}
}

func TestShoppingTripRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := db.Create(&models.Group{Name: "group-" + marker}).Error; err != nil {
			return err
		}
		if err := db.Create(&models.ShoppingList{GroupId: 1, Name: "list-" + marker}).Error; err != nil {
			return err
		}
		return db.Create(&models.ShoppingTrip{ShoppingListId: 1, PlannedItems: "[]", Status: "PENDING", LastError: "trip-" + marker, NextAttemptAt: time.Now(), QueuedAt: time.Now()}).Error
	})
	tw.RequireIdenticalIDs(t, "shopping_trips")

	repoA := NewShoppingTripRepository(tw.Handle(celltest.A), nil)
	repoB := NewShoppingTripRepository(tw.Handle(celltest.B), nil)

	tripA, err := repoA.GetTripById(1)
	if err != nil {
		t.Fatal(err)
	}
	tripsB, err := repoB.GetTripsForList(1, 10)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, tripA)
	tw.ExpectOwn(t, celltest.B, tripsB)

	if _, err := repoA.DeleteTripsForList(1); err != nil {
		t.Fatal(err)
	}
	tripsB, err = repoB.GetTripsForList(1, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(tripsB) != 1 {
		t.Fatalf("cell B lost its trip when cell A deleted the trips of its own list 1: %+v", tripsB)
	}
	tw.ExpectOwn(t, celltest.B, tripsB)
}

func TestGroupReceiptSettingsRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.Group{Name: "group-" + marker}).Error
	})

	repoA := NewGroupReceiptSettingsRepository(tw.Handle(celltest.A), nil)
	repoB := NewGroupReceiptSettingsRepository(tw.Handle(celltest.B), nil)
	if _, err := repoA.CreateGroupReceiptSettings(1); err != nil {
		t.Fatal(err)
	}
	if _, err := repoB.CreateGroupReceiptSettings(1); err != nil {
		t.Fatal(err)
	}

	// Hiding images in A reaches A only, although both cells hold group 1.
	if _, err := repoA.UpdateGroupReceiptSettings("1", commands.UpdateGroupReceiptSettingsCommand{HideImages: true}); err != nil {
		t.Fatal(err)
	}
	settingsA, err := repoA.GetGroupReceiptSettingsByGroupId(1)
	if err != nil {
		t.Fatal(err)
	}
	settingsB, err := repoB.GetGroupReceiptSettingsByGroupId(1)
	if err != nil {
		t.Fatal(err)
	}
	if !settingsA.HideImages || settingsB.HideImages {
		t.Errorf("hide-images crossed cells: A=%v B=%v", settingsA.HideImages, settingsB.HideImages)
	}
}

func TestRoleRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.AppRole{Name: "role-" + marker}).Error
	})
	tw.RequireIdenticalIDs(t, "app_roles")

	repoA := NewRoleRepository(tw.Handle(celltest.A), nil)
	repoB := NewRoleRepository(tw.Handle(celltest.B), nil)

	roleA, err := repoA.GetAppRoleById(1)
	if err != nil {
		t.Fatal(err)
	}
	roleB, err := repoB.GetAppRoleById(1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, roleA)
	tw.ExpectOwn(t, celltest.B, roleB)

	if _, err := repoA.UpdateAppRole(1, "renamed-in-a", "", nil, false); err != nil {
		t.Fatal(err)
	}
	if err := repoA.DeleteAppRole(1); err != nil {
		t.Fatal(err)
	}

	roleB, err = repoB.GetAppRoleById(1)
	if err != nil {
		t.Fatalf("cell B lost its role when cell A deleted its own: %v", err)
	}
	tw.ExpectOwn(t, celltest.B, roleB)
	if _, err := repoA.GetAppRoleById(1); err == nil {
		t.Error("cell A still reads a role it deleted")
	}
}

func TestGroupMemberRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := seedTwinUser(db, 1, "same-name"); err != nil {
			return err
		}
		if err := db.Create(&models.Group{Name: "group-" + marker}).Error; err != nil {
			return err
		}
		if err := db.Create(&models.Category{Name: "cat-" + marker}).Error; err != nil {
			return err
		}
		return db.Create(&models.GroupMember{UserID: 1, GroupID: 1}).Error
	})
	// Cell B alone has a second group with the same user in it.
	dbB := tw.Handle(celltest.B).DB()
	if err := dbB.Create(&models.Group{Name: "second-group"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := dbB.Create(&models.GroupMember{UserID: 1, GroupID: 2}).Error; err != nil {
		t.Fatal(err)
	}

	repoA := NewGroupMemberRepository(tw.Handle(celltest.A), nil)
	repoB := NewGroupMemberRepository(tw.Handle(celltest.B), nil)

	idsA, err := repoA.GetGroupIdsByUserId("1")
	if err != nil {
		t.Fatal(err)
	}
	idsB, err := repoB.GetGroupIdsByUserId("1")
	if err != nil {
		t.Fatal(err)
	}
	if len(idsA) != 1 || len(idsB) != 2 {
		t.Fatalf("group ids crossed cells: A=%v B=%v", idsA, idsB)
	}

	// A grant written in A reaches A only.
	if err := repoA.ReplaceMemberGrants(1, 1, []uint{1}, nil); err != nil {
		t.Fatal(err)
	}
	grantsA, err := repoA.GetMemberCategoryGrantIds(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	grantsB, err := repoB.GetMemberCategoryGrantIds(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(grantsA) != 1 || len(grantsB) != 0 {
		t.Errorf("member grants crossed cells: A=%v B=%v", grantsA, grantsB)
	}
}

func TestNotificationRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		for id, name := range map[uint]string{1: "first", 2: "second"} {
			if err := seedTwinUser(db, id, name); err != nil {
				return err
			}
		}
		if err := db.Create(&models.Group{Name: "group-" + marker}).Error; err != nil {
			return err
		}
		if err := db.Create(&models.GroupMember{UserID: 1, GroupID: 1}).Error; err != nil {
			return err
		}
		return db.Create(&models.Notification{Type: "INFO", Title: "note-" + marker, Body: "b", UserId: 1}).Error
	})
	// Only cell A has user 2 in group 1.
	if err := tw.Handle(celltest.A).DB().Create(&models.GroupMember{UserID: 2, GroupID: 1}).Error; err != nil {
		t.Fatal(err)
	}

	repoA := NewNotificationRepository(tw.Handle(celltest.A), nil)
	repoB := NewNotificationRepository(tw.Handle(celltest.B), nil)

	notesA, err := repoA.GetNotificationsForUser(1)
	if err != nil {
		t.Fatal(err)
	}
	notesB, err := repoB.GetNotificationsForUser(1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, notesA)
	tw.ExpectOwn(t, celltest.B, notesB)

	// A group notification reads the roster of the cell it is sent in: two recipients in A, one in B.
	if err := repoA.SendNotificationToGroup(1, "t", "b", "INFO", nil); err != nil {
		t.Fatal(err)
	}
	if err := repoB.SendNotificationToGroup(1, "t", "b", "INFO", nil); err != nil {
		t.Fatal(err)
	}
	var inA, inB int64
	tw.Handle(celltest.A).DB().Model(&models.Notification{}).Count(&inA)
	tw.Handle(celltest.B).DB().Model(&models.Notification{}).Count(&inB)
	if inA != 3 || inB != 2 {
		t.Errorf("notifications after a group send in each cell: A=%d (want 3) B=%d (want 2)", inA, inB)
	}

	if err := repoA.DeleteAllNotificationsForUser(1); err != nil {
		t.Fatal(err)
	}
	notesB, err = repoB.GetNotificationsForUser(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(notesB) != 2 {
		t.Errorf("cell B lost notifications when cell A cleared its own: %+v", notesB)
	}
}

func TestReceiptProcessingSettingsRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.ReceiptProcessingSettings{Name: "ai-" + marker}).Error
	})
	tw.RequireIdenticalIDs(t, "receipt_processing_settings")

	repoA := NewReceiptProcessingSettings(tw.Handle(celltest.A), nil)
	repoB := NewReceiptProcessingSettings(tw.Handle(celltest.B), nil)

	settingsA, err := repoA.GetReceiptProcessingSettingsById("1")
	if err != nil {
		t.Fatal(err)
	}
	settingsB, err := repoB.GetReceiptProcessingSettingsById("1")
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, settingsA)
	tw.ExpectOwn(t, celltest.B, settingsB)

	if err := repoA.DeleteReceiptProcessingSettingsById("1"); err != nil {
		t.Fatal(err)
	}
	settingsB, err = repoB.GetReceiptProcessingSettingsById("1")
	if err != nil {
		t.Fatalf("cell B lost its settings when cell A deleted its own: %v", err)
	}
	tw.ExpectOwn(t, celltest.B, settingsB)
}

// The file repository reads the PDF resolution from the System Settings of its own cell.
func TestFileRepositoryReadsItsCellsSettings(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	for w, dpi := range map[celltest.Which]int{celltest.A: 150, celltest.B: 600} {
		if err := tw.Handle(w).DB().Create(&models.SystemSettings{BaseModel: models.BaseModel{ID: 1}, PdfDpi: dpi}).Error; err != nil {
			t.Fatal(err)
		}
	}

	if got := NewFileRepository(tw.Handle(celltest.A), nil).pdfRasterizationDpi(); got != 150 {
		t.Errorf("cell A rasterizes at %v dpi, want 150", got)
	}
	if got := NewFileRepository(tw.Handle(celltest.B), nil).pdfRasterizationDpi(); got != 600 {
		t.Errorf("cell B rasterizes at %v dpi, want 600", got)
	}
}

func TestReceiptProductRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := seedTwinUser(db, 1, "same-name"); err != nil {
			return err
		}
		if err := db.Create(&models.Group{Name: "group-" + marker}).Error; err != nil {
			return err
		}
		if err := db.Create(&models.Receipt{Name: "receipt-" + marker, Amount: decimal.RequireFromString("1.00"), Date: time.Now(), PaidByUserID: 1, GroupId: 1}).Error; err != nil {
			return err
		}
		return db.Create(&models.ReceiptProduct{ReceiptId: 1, Name: "product-" + marker}).Error
	})
	tw.RequireIdenticalIDs(t, "receipt_products")

	repoA := NewReceiptProductRepository(tw.Handle(celltest.A), nil)
	repoB := NewReceiptProductRepository(tw.Handle(celltest.B), nil)

	productsA, _, err := repoA.GetReceiptProducts(1)
	if err != nil {
		t.Fatal(err)
	}
	productsB, _, err := repoB.GetReceiptProducts(1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, productsA)
	tw.ExpectOwn(t, celltest.B, productsB)

	// Replacing receipt 1's products in A (which also requeues a trip through a sibling repository built from the
	// same handle) and then deleting them leaves B's receipt 1 untouched.
	if err := repoA.ReplaceProducts(1, []models.ReceiptProduct{{ReceiptId: 1, Name: "replaced-in-a"}}); err != nil {
		t.Fatal(err)
	}
	if err := repoA.DeleteReceiptProducts(1); err != nil {
		t.Fatal(err)
	}

	productsB, _, err = repoB.GetReceiptProducts(1)
	if err != nil {
		t.Fatal(err)
	}
	if len(productsB) != 1 {
		t.Fatalf("cell B lost its product: %+v", productsB)
	}
	tw.ExpectOwn(t, celltest.B, productsB)
}

// seedTwinReceipt seeds user 1, group 1 and receipt 1 (named with the marker) into one cell.
func seedTwinReceipt(db *gorm.DB, marker string) error {
	if err := seedTwinUser(db, 1, "same-name"); err != nil {
		return err
	}
	if err := db.Create(&models.Group{Name: "group-" + marker}).Error; err != nil {
		return err
	}
	return db.Create(&models.Receipt{Name: "receipt-" + marker, Amount: decimal.RequireFromString("1.00"), Date: time.Now(), PaidByUserID: 1, GroupId: 1}).Error
}

func TestReceiptRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, seedTwinReceipt)
	tw.RequireIdenticalIDs(t, "receipts")

	repoA := NewReceiptRepository(tw.Handle(celltest.A), nil)
	repoB := NewReceiptRepository(tw.Handle(celltest.B), nil)

	receiptA, err := repoA.GetReceiptById("1")
	if err != nil {
		t.Fatal(err)
	}
	receiptB, err := repoB.GetReceiptById("1")
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, receiptA)
	tw.ExpectOwn(t, celltest.B, receiptB)

	fullA, err := repoA.GetFullyLoadedReceiptById("1")
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, fullA)

	// The failed-update task is recorded in the cell of the repository that failed.
	createFailedUpdateSystemTask(repoA.Cell, commands.UpsertSystemTaskCommand{
		Type: models.RECEIPT_UPDATED, AssociatedEntityType: models.RECEIPT, AssociatedEntityId: 1, StartedAt: time.Now(),
	}, errors.New("boom"))
	var inA, inB int64
	tw.Handle(celltest.A).DB().Model(&models.SystemTask{}).Count(&inA)
	tw.Handle(celltest.B).DB().Model(&models.SystemTask{}).Count(&inB)
	if inA != 1 || inB != 0 {
		t.Errorf("failed-update tasks after a failure in cell A: A=%d (want 1) B=%d (want 0)", inA, inB)
	}

	pagedB, err := repoB.GetReceiptsByGroupIds([]string{"1"}, "*", "")
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.B, pagedB)
}

func TestReceiptImageRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := seedTwinReceipt(db, marker); err != nil {
			return err
		}
		return db.Create(&models.FileData{Name: "scan-" + marker + ".jpg", FileType: "image/jpeg", Size: 1, ReceiptId: 1}).Error
	})
	tw.RequireIdenticalIDs(t, "file_data")

	repoA := NewReceiptImageRepository(tw.Handle(celltest.A), nil)
	repoB := NewReceiptImageRepository(tw.Handle(celltest.B), nil)

	imageA, err := repoA.GetReceiptImageById(1)
	if err != nil {
		t.Fatal(err)
	}
	imagesB, err := repoB.GetReceiptImagesByIdArray([]uint{1})
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, imageA)
	tw.ExpectOwn(t, celltest.B, imagesB)
}

func TestCommentRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := seedTwinReceipt(db, marker); err != nil {
			return err
		}
		if err := seedTwinUser(db, 2, "second"); err != nil {
			return err
		}
		if err := db.Create(&models.GroupMember{UserID: 1, GroupID: 1}).Error; err != nil {
			return err
		}
		author := uint(1)
		return db.Create(&models.Comment{Comment: "comment-" + marker, ReceiptId: 1, UserId: &author}).Error
	})
	// Only cell A has a second member, who is the one to be notified of a new comment.
	if err := tw.Handle(celltest.A).DB().Create(&models.GroupMember{UserID: 2, GroupID: 1}).Error; err != nil {
		t.Fatal(err)
	}

	repoA := NewCommentRepository(tw.Handle(celltest.A), nil)
	repoB := NewCommentRepository(tw.Handle(celltest.B), nil)

	commentsA, err := repoA.GetCommentsForReceiptIds([]uint{1})
	if err != nil {
		t.Fatal(err)
	}
	commentsB, err := repoB.GetCommentsForReceiptIds([]uint{1})
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, commentsA)
	tw.ExpectOwn(t, celltest.B, commentsB)

	// The notification fan-out of a new comment runs in the commenting cell, through sibling repositories.
	author := uint(1)
	if _, err := repoA.AddComment(commands.UpsertCommentCommand{Comment: "new", ReceiptId: 1, UserId: &author}, nil); err != nil {
		t.Fatal(err)
	}
	var notificationsA, notificationsB, commentsInB int64
	tw.Handle(celltest.A).DB().Model(&models.Notification{}).Count(&notificationsA)
	tw.Handle(celltest.B).DB().Model(&models.Notification{}).Count(&notificationsB)
	tw.Handle(celltest.B).DB().Model(&models.Comment{}).Count(&commentsInB)
	if notificationsA != 1 || notificationsB != 0 || commentsInB != 1 {
		t.Errorf("after a comment in cell A: notifications A=%d (want 1) B=%d (want 0), comments in B=%d (want 1)", notificationsA, notificationsB, commentsInB)
	}
}

func TestGroupRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := seedTwinUser(db, 1, "same-name"); err != nil {
			return err
		}
		if err := db.Create(&models.Group{Name: "group-" + marker}).Error; err != nil {
			return err
		}
		return db.Create(&models.GroupMember{UserID: 1, GroupID: 1}).Error
	})
	// Cell B alone has a second group with the user in it.
	dbB := tw.Handle(celltest.B).DB()
	if err := dbB.Create(&models.Group{Name: "second-group"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := dbB.Create(&models.GroupMember{UserID: 1, GroupID: 2}).Error; err != nil {
		t.Fatal(err)
	}

	repoA := NewGroupRepository(tw.Handle(celltest.A), nil)
	repoB := NewGroupRepository(tw.Handle(celltest.B), nil)

	paged := commands.PagedGroupRequestCommand{PagedRequestCommand: commands.PagedRequestCommand{Page: 1, PageSize: 10, OrderBy: "name", SortDirection: commands.ASCENDING}}
	groupsA, countA, err := repoA.GetPagedGroups(paged, "1")
	if err != nil {
		t.Fatal(err)
	}
	groupsB, countB, err := repoB.GetPagedGroups(paged, "1")
	if err != nil {
		t.Fatal(err)
	}
	if countA != 1 || countB != 2 {
		t.Errorf("the roster of user 1 crossed cells: A lists %d groups (want 1), B lists %d (want 2)", countA, countB)
	}
	tw.RejectOther(t, celltest.A, groupsA)
	tw.ExpectOwn(t, celltest.B, groupsB[:1])

	// A group created in A (with its settings and role assignment through sibling repositories) stays in A.
	if err := SeedSystemRoles(tw.Handle(celltest.A)); err != nil {
		t.Fatal(err)
	}
	if err := EnsureDefaultRoles(tw.Handle(celltest.A)); err != nil {
		t.Fatal(err)
	}
	created, err := repoA.CreateGroup(commands.UpsertGroupCommand{Name: "created-in-a", Status: models.GroupStatus("ACTIVE")}, 1)
	if err != nil {
		t.Fatal(err)
	}
	var settingsInA, settingsInB, groupsInB int64
	tw.Handle(celltest.A).DB().Model(&models.GroupReceiptSettings{}).Where("group_id = ?", created.ID).Count(&settingsInA)
	tw.Handle(celltest.B).DB().Model(&models.GroupReceiptSettings{}).Count(&settingsInB)
	tw.Handle(celltest.B).DB().Model(&models.Group{}).Count(&groupsInB)
	if settingsInA != 1 || settingsInB != 0 || groupsInB != 2 {
		t.Errorf("after CreateGroup in cell A: settings in A=%d (want 1), settings in B=%d (want 0), groups in B=%d (want 2)", settingsInA, settingsInB, groupsInB)
	}
}

func TestUserRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.User{BaseModel: models.BaseModel{ID: 1}, Username: "same-name", DisplayName: "user-" + marker, Password: "x"}).Error
	})
	tw.RequireIdenticalIDs(t, "users")

	repoA := NewUserRepository(tw.Handle(celltest.A), nil)
	repoB := NewUserRepository(tw.Handle(celltest.B), nil)

	userA, err := repoA.GetUserByUsername("same-name")
	if err != nil {
		t.Fatal(err)
	}
	userB, err := repoB.GetUserById(1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, userA)
	tw.ExpectOwn(t, celltest.B, userB)

	// A sign-up in A creates the account, its preferences and its group (sibling repositories) in A only.
	if err := SeedSystemRoles(tw.Handle(celltest.A)); err != nil {
		t.Fatal(err)
	}
	if err := EnsureDefaultRoles(tw.Handle(celltest.A)); err != nil {
		t.Fatal(err)
	}
	created, err := repoA.CreateUser(commands.SignUpCommand{Username: "new-in-a", Password: "Password1!", DisplayName: "New"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repoB.GetUserByUsername("new-in-a"); err == nil {
		t.Error("cell B can see a user created in cell A")
	}
	var prefsInA, prefsInB, groupsInB int64
	tw.Handle(celltest.A).DB().Model(&models.UserPrefernces{}).Where("user_id = ?", created.ID).Count(&prefsInA)
	tw.Handle(celltest.B).DB().Model(&models.UserPrefernces{}).Count(&prefsInB)
	tw.Handle(celltest.B).DB().Model(&models.Group{}).Count(&groupsInB)
	if prefsInA != 1 || prefsInB != 0 || groupsInB != 0 {
		t.Errorf("after CreateUser in cell A: preferences in A=%d (want 1), in B=%d (want 0), groups in B=%d (want 0)", prefsInA, prefsInB, groupsInB)
	}

	// The first-admin check reads the roles of its own cell.
	first, err := repoB.IsFirstAdminToLogin()
	if err != nil {
		t.Fatal(err)
	}
	if !first {
		t.Error("cell B has no admin role, so its first login counts as the first admin")
	}
}
