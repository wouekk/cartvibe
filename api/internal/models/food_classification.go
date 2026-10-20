package models

import (
	"strings"
	"time"
)

// Health ratings. Plain strings on the API, never an enum: a released client must survive a new one.
const (
	HEALTH_HEALTHY   = "HEALTHY"
	HEALTH_MEDIUM    = "MEDIUM"
	HEALTH_UNHEALTHY = "UNHEALTHY"
	// Not food or drink (a carrier bag, batteries); shown without a health tag.
	HEALTH_NOT_FOOD = "NOT_FOOD"
	// The AI answered with something unusable for this product.
	HEALTH_UNKNOWN = "UNKNOWN"
)

// Seasonality of fresh fruit and vegetables in Western Europe, in the month the product was bought
// (or, for a shopping list item, is being bought). Plain strings, like the health ratings.
const (
	SEASONALITY_SEASONAL      = "SEASONAL"
	SEASONALITY_OUT_OF_SEASON = "OUT_OF_SEASON"
	SEASONALITY_NOT_PRODUCE   = "NOT_PRODUCE"
)

// MaxFoodClassificationAttempts is how many unusable AI answers a product gets before it is left
// unclassified for good. Outages do not count.
const MaxFoodClassificationAttempts = 3

var healthRatings = []string{HEALTH_HEALTHY, HEALTH_MEDIUM, HEALTH_UNHEALTHY, HEALTH_NOT_FOOD}

var seasonalities = []string{SEASONALITY_SEASONAL, SEASONALITY_OUT_OF_SEASON, SEASONALITY_NOT_PRODUCE}

// IsHealthRating reports whether health is one the user may set (UNKNOWN is the AI's, not theirs).
func IsHealthRating(health string) bool {
	for _, rating := range healthRatings {
		if rating == health {
			return true
		}
	}
	return false
}

func IsSeasonality(seasonality string) bool {
	for _, value := range seasonalities {
		if value == seasonality {
			return true
		}
	}
	return false
}

// FoodClassification is embedded in ReceiptProduct and ShoppingListItem: how healthy the product is,
// its food group, and — for fresh produce — whether it is in season. A nil ClassifiedAt means not
// classified yet; the classification sweep picks those up.
type FoodClassification struct {
	Health      string     `gorm:"type:varchar(20);not null;default:''" json:"health"`
	FoodGroup   string     `gorm:"type:varchar(50);not null;default:''" json:"foodGroup"`
	Seasonality string     `gorm:"type:varchar(20);not null;default:''" json:"seasonality"`
	ClassifiedAt *time.Time `gorm:"index" json:"classifiedAt"`
	// ClassificationOverridden is set when a person corrected it; the sweep never overwrites it.
	ClassificationOverridden bool `gorm:"not null;default:false" json:"classificationOverridden"`
	ClassificationAttempts   int  `gorm:"not null;default:0" json:"-"`
}

// ProductClassificationOverride is a group's own view of a product ("dark chocolate is MEDIUM"),
// learned from its corrections. Applied over the AI's answer, and given to the AI as examples.
// Seasonality is deliberately not remembered: it depends on the month, not on the product.
type ProductClassificationOverride struct {
	BaseModel
	Group          Group  `json:"-"`
	GroupId        uint   `gorm:"not null;uniqueIndex:idx_product_classification_override_name,priority:1" json:"groupId"`
	NormalizedName string `gorm:"type:varchar(200);not null;uniqueIndex:idx_product_classification_override_name,priority:2" json:"normalizedName"`
	Health         string `gorm:"type:varchar(20);not null" json:"health"`
}

// NormalizeProductName is the key corrections are remembered under: trimmed, lower-case, single
// spaces, so "Dark Chocolate " and "dark  chocolate" are one product.
func NormalizeProductName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	return strings.Join(strings.Fields(name), " ")
}
