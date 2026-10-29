package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/shoplogos"
	"cartvibe/api/internal/utils"

	"github.com/shopspring/decimal"
)

func TestWantedShopLogosAreTheKnownBrandsOnTheReceipts(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestGroupWithUsers()

	seed := func(name string, shopName string) {
		t.Helper()
		receipt := models.Receipt{
			Name:         name,
			ShopName:     shopName,
			Amount:       decimal.NewFromInt(1),
			Date:         time.Now(),
			PaidByUserID: 1,
			GroupId:      1,
			Status:       models.OPEN,
		}
		if err := repositories.GetDB().Create(&receipt).Error; err != nil {
			t.Fatalf("seed receipt: %v", err)
		}
	}
	seed("Receipt 2026-10-01", "LIDL Polska sp. z o.o.")
	seed("Receipt 2026-10-02", "Lidl")
	seed("Uber ride", "")                       // no shop: the receipt name counts, as in the monogram
	seed("Receipt 2026-10-03", "Corner bakery") // not a known brand
	seed("Ryanair booking", "Biedronka")        // the shop wins over the name

	wanted, err := WantedShopLogos()
	if err != nil {
		t.Fatal(err)
	}
	slugs := []string{}
	for _, brand := range wanted {
		slugs = append(slugs, brand.Slug)
	}
	got := strings.Join(slugs, ",")
	for _, want := range []string{"lidl", "biedronka", "uber"} {
		if !strings.Contains(","+got+",", ","+want+",") {
			t.Errorf("expected %s among %s", want, got)
		}
	}
	if len(slugs) != 3 {
		t.Errorf("expected only lidl, biedronka and uber, once each, got %s", got)
	}
}

func TestDownloadedShopLogosStayOnWithoutAKey(t *testing.T) {
	defer repositories.TruncateTestDb()

	featureConfig, err := NewSystemSettingsService(nil).GetFeatureConfig()
	if err != nil {
		t.Fatal(err)
	}
	if featureConfig.ShopLogosEnabled {
		t.Fatal("without a key or a logo, logos should be off")
	}

	dataDir, err := utils.GetDataDir()
	if err != nil {
		t.Fatal(err)
	}
	folder := filepath.Join(dataDir, shoplogos.Folder)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(folder) })
	if err := os.WriteFile(filepath.Join(folder, "lidl.png"), []byte("\x89PNG\r\n\x1a\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	featureConfig, err = NewSystemSettingsService(nil).GetFeatureConfig()
	if err != nil {
		t.Fatal(err)
	}
	if !featureConfig.ShopLogosEnabled {
		t.Error("logos downloaded with an earlier key should still be shown after the key is removed")
	}
}
