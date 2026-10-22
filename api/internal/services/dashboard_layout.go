package services

import (
	"encoding/json"
	"errors"
)

// MaxDashboardLayoutBytes caps a saved layout; a real one (a few dozen panels) is around 2 KB.
const MaxDashboardLayoutBytes = 16 * 1024

// CanCustomiseDashboard is the one place that decides whether a person may save their own Dashboard layout. Everyone
// may today; a paid tier would answer here. Clients read it as `canCustomise` on GET /dashboardLayout, and a person
// who may not still gets the default layout.
func CanCustomiseDashboard(userId uint) bool {
	return true
}

// ValidateDashboardLayout checks only the envelope: a JSON object of at most MaxDashboardLayoutBytes with a numeric
// version. Panel contents belong to the clients, so a newer client can add fields without an API change.
func ValidateDashboardLayout(layout string) error {
	if len(layout) > MaxDashboardLayoutBytes {
		return errors.New("the dashboard layout is too large")
	}

	var envelope map[string]any
	if err := json.Unmarshal([]byte(layout), &envelope); err != nil {
		return errors.New("the dashboard layout must be a JSON object")
	}

	if _, ok := envelope["version"].(float64); !ok {
		return errors.New("the dashboard layout needs a version")
	}

	return nil
}
