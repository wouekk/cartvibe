package repositories

import (
	"testing"
	"time"

	"cartvibe/api/internal/cell/celltest"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"

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
