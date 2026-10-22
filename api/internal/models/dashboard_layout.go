package models

// DashboardLayout is one person's Dashboard arrangement: which panels show, in what order and at what size. Layout is
// a JSON document owned by the clients (`{"version": 1, "panels": [...], "compactOrder": [...]}`); the API checks only
// that it is a JSON object with a version, so a newer client can add fields without an API change. No row means the
// default layout. It is its own resource, not a UserPreferences field, because that update replaces the whole object.
type DashboardLayout struct {
	BaseModel
	UserId uint   `gorm:"not null; uniqueIndex" json:"userId"`
	User   *User  `json:"-"`
	Layout string `gorm:"type:text" json:"layout"`
	// CanCustomise says whether this person may save a layout (services.CanCustomiseDashboard); computed, never stored.
	CanCustomise bool `gorm:"-" json:"canCustomise"`
}
