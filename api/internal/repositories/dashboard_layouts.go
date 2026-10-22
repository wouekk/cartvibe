package repositories

import (
	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

type DashboardLayoutRepository struct {
	BaseRepository
}

func NewDashboardLayoutRepository(tx *gorm.DB) DashboardLayoutRepository {
	return DashboardLayoutRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX: tx,
	}}
}

// GetDashboardLayout returns the user's layout; a user who never saved one gets an empty layout (the default).
func (repository DashboardLayoutRepository) GetDashboardLayout(userId uint) (models.DashboardLayout, error) {
	db := repository.GetDB()
	var layout models.DashboardLayout

	err := db.Model(models.DashboardLayout{}).Where("user_id = ?", userId).Find(&layout).Error
	if err != nil {
		return models.DashboardLayout{}, err
	}

	layout.UserId = userId
	return layout, nil
}

// SaveDashboardLayout creates or replaces the user's layout.
func (repository DashboardLayoutRepository) SaveDashboardLayout(userId uint, layout string) (models.DashboardLayout, error) {
	db := repository.GetDB()

	existing, err := repository.GetDashboardLayout(userId)
	if err != nil {
		return models.DashboardLayout{}, err
	}

	if existing.ID == 0 {
		existing = models.DashboardLayout{UserId: userId, Layout: layout}
		err = db.Create(&existing).Error
	} else {
		existing.Layout = layout
		err = db.Model(&existing).Update("layout", layout).Error
	}
	if err != nil {
		return models.DashboardLayout{}, err
	}

	return repository.GetDashboardLayout(userId)
}
