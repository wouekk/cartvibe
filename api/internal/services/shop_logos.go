package services

import (
	"context"
	"sync"

	"cartvibe/api/internal/logging"
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

// SyncShopLogos downloads the missing or stale logos with the household's key and waits for the run. Without a key
// it does nothing. The daily clean-up task calls it.
func SyncShopLogos(ctx context.Context) error {
	key := shopLogoKey()
	if key == "" {
		return nil
	}
	_, syncer, err := ShopLogos()
	if err != nil {
		return err
	}
	return syncer.Run(ctx, key)
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
