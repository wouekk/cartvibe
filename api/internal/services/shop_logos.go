package services

import (
	"context"
	"sync"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/shoplogos"
)

var (
	shopLogosOnce   sync.Once
	shopLogoStore   *shoplogos.Store
	shopLogoSyncer  *shoplogos.Syncer
	shopLogoInitErr error
)

// ShopLogos is the household's one logo store and sync, made on first use.
func ShopLogos() (*shoplogos.Store, *shoplogos.Syncer, error) {
	shopLogosOnce.Do(func() {
		shopLogoStore, shopLogoInitErr = shoplogos.NewStore()
		if shopLogoInitErr == nil {
			shopLogoSyncer = shoplogos.NewSyncer(shopLogoStore)
		}
	})
	return shopLogoStore, shopLogoSyncer, shopLogoInitErr
}

// shopLogoKey reads the household's Logo.dev secret key; "" without one.
func shopLogoKey() string {
	settings, err := repositories.NewSystemSettingsRepository(nil).GetSystemSettings()
	if err != nil {
		return ""
	}
	return repositories.ShopLogoSecretKey(settings)
}

// WantedShopLogos lists the known brands that appear on the household's receipts, by shop name or, without one, by
// receipt name (what the monogram shows). Only these are downloaded: Logo.dev's free plan pays for about 250 logos a
// month, fewer than the brands CartVibe knows.
func WantedShopLogos() ([]shoplogos.Brand, error) {
	db := repositories.GetDB()
	var shopNames []string
	if err := db.Model(&models.Receipt{}).Where("shop_name <> ''").Distinct().Pluck("shop_name", &shopNames).Error; err != nil {
		return nil, err
	}
	var receiptNames []string
	if err := db.Model(&models.Receipt{}).Where("shop_name = '' OR shop_name IS NULL").Distinct().Pluck("name", &receiptNames).Error; err != nil {
		return nil, err
	}
	return shoplogos.BrandsFor(append(shopNames, receiptNames...)), nil
}

// ShopLogoStatus reports the logos of the brands on the receipts, for System Settings → Shop Logos.
func ShopLogoStatus() (shoplogos.Status, error) {
	_, syncer, err := ShopLogos()
	if err != nil {
		return shoplogos.Status{}, err
	}
	wanted, err := WantedShopLogos()
	if err != nil {
		return shoplogos.Status{}, err
	}
	return syncer.Status(wanted), nil
}

// SyncShopLogos downloads the missing logos of the brands on the receipts with the household's key, and waits for the
// run. Without a key it does nothing. The clean-up task calls it.
func SyncShopLogos(ctx context.Context) error {
	key := shopLogoKey()
	if key == "" {
		return nil
	}
	_, syncer, err := ShopLogos()
	if err != nil {
		return err
	}
	wanted, err := WantedShopLogos()
	if err != nil {
		return err
	}
	return syncer.Run(ctx, key, wanted)
}

// StartShopLogoSync runs SyncShopLogos in the background: after a key is saved, and when the API starts. A failure
// is kept in the sync status (System Settings → Shop Logos) and the log, never returned.
func StartShopLogoSync() {
	go func() {
		if err := SyncShopLogos(context.Background()); err != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "Shop logos: "+err.Error())
		}
	}()
}

// ClearShopLogos removes every downloaded logo, when the household removes its key.
func ClearShopLogos() error {
	store, _, err := ShopLogos()
	if err != nil {
		return err
	}
	return store.Clear()
}
