package services

import (
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"gorm.io/gorm"
)

type SystemSettingsService struct {
	BaseService
}

func NewSystemSettingsService(tx *gorm.DB) SystemSettingsService {
	service := SystemSettingsService{BaseService: BaseService{
		DB: repositories.GetDB(),
		TX: tx,
	}}
	return service
}

func (service SystemSettingsService) GetFeatureConfig() (structs.FeatureConfig, error) {
	systemSettingsRepository := repositories.NewSystemSettingsRepository(service.TX)
	featureConfig := structs.FeatureConfig{
		// Initialized before anything can fail, and only ever overwritten on
		// success, so this can never serialize as null. See the field's doc comment.
		OidcProviders: []structs.OidcProviderSummary{},
	}

	systemSettings, err := systemSettingsRepository.GetSystemSettings()
	if err != nil {
		return structs.FeatureConfig{}, err
	}

	aiPoweredReceipts := systemSettings.ReceiptProcessingSettingsId != nil

	featureConfig.EnableLocalSignUp = systemSettings.EnableLocalSignUp
	featureConfig.AiPoweredReceipts = aiPoweredReceipts
	featureConfig.ShopLogosEnabled = systemSettings.ShopLogoKeySet || HasShopLogos()
	featureConfig.WebPushPublicKey = WebPushPublicKey()

	providers, err := repositories.NewOidcProviderRepository(service.TX).GetAllEnabledOidcProviders()
	if err != nil {
		return structs.FeatureConfig{}, err
	}

	for _, provider := range providers {
		featureConfig.OidcProviders = append(featureConfig.OidcProviders, structs.OidcProviderSummary{
			Name:        provider.Name,
			DisplayName: provider.DisplayName,
		})
	}

	return featureConfig, nil
}
