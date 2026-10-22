package models

type Tag struct {
	BaseModel
	Name        string `gorm:"not null; uniqueIndex" json:"name"`
	Description string `json:"description"`
	// ShowOnDashboard gives the tag its own Dashboard tile: what the period's product lines carrying the
	// tag cost, and their share of the period's spend. Household-wide, like the tag itself.
	ShowOnDashboard bool `gorm:"not null;default:false" json:"showOnDashboard"`
}
