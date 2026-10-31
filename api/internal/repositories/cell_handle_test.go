package repositories

import (
	"os"
	"testing"

	"cartvibe/api/internal/cell/celltest"
	"cartvibe/api/internal/models"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// The repositories already moved onto cell.Handle are tested against twin cells: no read or write crosses cells.
// The standalone side (ImplicitCell is the process database) is in implicit_cell_test.go.

func TestRepositoriesUseTheHandlesDatabase(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)

	for _, w := range []celltest.Which{celltest.A, celltest.B} {
		h := tw.Handle(w)
		if NewAboutRepository(h, nil).GetDB() != h.DB() {
			t.Errorf("cell %s: AboutRepository does not use its handle's database", w)
		}
		if NewExchangeRateRepository(h, nil).GetDB() != h.DB() {
			t.Errorf("cell %s: ExchangeRateRepository does not use its handle's database", w)
		}
		if NewDashboardLayoutRepository(h, nil).GetDB() != h.DB() {
			t.Errorf("cell %s: DashboardLayoutRepository does not use its handle's database", w)
		}
	}
}

func TestAboutRepositoryReadsTheEnvironment(t *testing.T) {
	t.Setenv("VERSION", "9.9.9")
	t.Setenv("BUILD_DATE", "")
	os.Unsetenv("BUILD_DATE")

	about, err := NewAboutRepository(ImplicitCell(), nil).GetAboutData()
	if err != nil {
		t.Fatal(err)
	}
	if about.Version != "9.9.9" || about.BuildDate != "unknown" {
		t.Errorf("unexpected about data: %+v", about)
	}
}

func seedTwinUser(db *gorm.DB, id uint, username string) error {
	return db.Create(&models.User{BaseModel: models.BaseModel{ID: id}, Username: username, DisplayName: username, Password: "x"}).Error
}

func TestDashboardLayoutRepositoryStaysInItsCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := seedTwinUser(db, 1, "same-name"); err != nil {
			return err
		}
		return db.Create(&models.DashboardLayout{UserId: 1, Layout: `{"version":1,"note":"` + marker + `"}`}).Error
	})
	tw.RequireIdenticalIDs(t, "users")
	tw.RequireIdenticalIDs(t, "dashboard_layouts")

	repoA := NewDashboardLayoutRepository(tw.Handle(celltest.A), nil)
	repoB := NewDashboardLayoutRepository(tw.Handle(celltest.B), nil)

	// The same user id in both cells reads each cell's own layout.
	layoutA, err := repoA.GetDashboardLayout(1)
	if err != nil {
		t.Fatal(err)
	}
	layoutB, err := repoB.GetDashboardLayout(1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, layoutA)
	tw.ExpectOwn(t, celltest.B, layoutB)

	// A save in A reaches A only.
	saved, err := repoA.SaveDashboardLayout(1, `{"version":1,"note":"`+tw.Marker(celltest.A)+`-saved"}`)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, saved)

	layoutB, err = repoB.GetDashboardLayout(1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.B, layoutB)

	// A user that exists only in B has no layout as far as A can tell.
	if err := seedTwinUser(tw.Handle(celltest.B).DB(), 2, "only-in-b"); err != nil {
		t.Fatal(err)
	}
	if err := tw.Handle(celltest.B).DB().Create(&models.DashboardLayout{UserId: 2, Layout: `{"version":1,"note":"` + tw.Marker(celltest.B) + `-user2"}`}).Error; err != nil {
		t.Fatal(err)
	}
	missing, err := repoA.GetDashboardLayout(2)
	if err != nil {
		t.Fatal(err)
	}
	if missing.Layout != "" {
		t.Errorf("cell A returned a layout for a user it does not have: %+v", missing)
	}
	tw.RejectOther(t, celltest.A, missing)
}

func TestExchangeRateRepositoryStaysInItsCell(t *testing.T) {
	// The rate column takes a decimal, so the markers are decimals.
	tw := celltest.NewTwin(t, migrateSchema, celltest.WithMarkers("111.111111", "222.222222"))
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		rate := decimal.RequireFromString(marker)
		if err := db.Create(&models.ExchangeRate{Code: "CHF", Rate: &rate}).Error; err != nil {
			return err
		}
		return db.Create(&models.ExchangeRate{Code: "PLN", Rate: &rate}).Error
	})
	tw.RequireIdenticalIDs(t, "exchange_rates")

	repoA := NewExchangeRateRepository(tw.Handle(celltest.A), nil)
	repoB := NewExchangeRateRepository(tw.Handle(celltest.B), nil)

	ratesA, err := repoA.GetAll()
	if err != nil {
		t.Fatal(err)
	}
	ratesB, err := repoB.GetAll()
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, ratesA)
	tw.ExpectOwn(t, celltest.B, ratesB)

	// Replacing A's list (ids 1 and 2 are updated or removed in A) leaves B's rows alone.
	changed := decimal.RequireFromString("333.333333")
	if _, err := repoA.ReplaceAll([]models.ExchangeRate{{Code: "USD", Rate: &changed}}); err != nil {
		t.Fatal(err)
	}
	ratesB, err = repoB.GetAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(ratesB) != 2 {
		t.Errorf("a ReplaceAll in cell A changed cell B: %+v", ratesB)
	}
	tw.ExpectOwn(t, celltest.B, ratesB)

	ratesA, err = repoA.GetAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(ratesA) != 1 || ratesA[0].Code != "USD" {
		t.Errorf("cell A did not take its own replacement: %+v", ratesA)
	}
	tw.RejectOther(t, celltest.A, ratesA)
}

func TestSeedExchangeRatesSeedsOnlyTheGivenCell(t *testing.T) {
	tw := celltest.NewTwin(t, migrateSchema, celltest.WithMarkers("111.111111", "222.222222"))
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		rate := decimal.RequireFromString(marker)
		return db.Create(&models.ExchangeRate{Code: "CHF", Rate: &rate}).Error
	})

	// Cell B is emptied; seeding B fills B and must not touch A, which already has a row.
	if err := tw.Handle(celltest.B).DB().Where("1 = 1").Delete(&models.ExchangeRate{}).Error; err != nil {
		t.Fatal(err)
	}
	if err := SeedExchangeRates(tw.Handle(celltest.B), []string{"CHF", "PLN", "USD"}, "USD"); err != nil {
		t.Fatal(err)
	}

	ratesB, err := NewExchangeRateRepository(tw.Handle(celltest.B), nil).GetAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(ratesB) != 2 {
		t.Errorf("cell B should list CHF and PLN (the main currency is skipped), got %+v", ratesB)
	}
	tw.RejectOther(t, celltest.B, ratesB)

	ratesA, err := NewExchangeRateRepository(tw.Handle(celltest.A), nil).GetAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(ratesA) != 1 {
		t.Errorf("seeding cell B changed cell A: %+v", ratesA)
	}
	tw.ExpectOwn(t, celltest.A, ratesA)
}
