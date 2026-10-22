package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func dashboardLayoutBody(layout string) string {
	encoded, _ := json.Marshal(map[string]string{"layout": layout})
	return string(encoded)
}

func TestDashboardLayoutStartsEmptyAndRoundTrips(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAppPerms(t, 1, permissions.AppUserPreferencesRead, permissions.AppUserPreferencesUpdate)

	w, r := shoppingListRequest("GET", "", 1, nil)
	GetDashboardLayout(w, r)
	assertStatus(t, w, http.StatusOK)
	empty := decodeShoppingListResponse[models.DashboardLayout](t, w)
	if empty.Layout != "" || empty.UserId != 1 || !empty.CanCustomise {
		t.Errorf("a user without a layout gets an empty one they may customise, got %+v", empty)
	}

	layout := `{"version":1,"panels":[{"id":"spent","visible":true,"cols":2,"rows":1},{"id":"tag:7","visible":false,"cols":1,"rows":1}],"future":"kept"}`
	w, r = shoppingListRequest("PUT", dashboardLayoutBody(layout), 1, nil)
	UpdateDashboardLayout(w, r)
	assertStatus(t, w, http.StatusOK)

	// A second save replaces the first, still one row.
	second := `{"version":1,"panels":[],"compactOrder":["shoppingList"]}`
	w, r = shoppingListRequest("PUT", dashboardLayoutBody(second), 1, nil)
	UpdateDashboardLayout(w, r)
	assertStatus(t, w, http.StatusOK)

	w, r = shoppingListRequest("GET", "", 1, nil)
	GetDashboardLayout(w, r)
	saved := decodeShoppingListResponse[models.DashboardLayout](t, w)
	if saved.Layout != second {
		t.Errorf("expected the second layout back, got %q", saved.Layout)
	}
	var rows int64
	repositories.GetDB().Model(&models.DashboardLayout{}).Count(&rows)
	if rows != 1 {
		t.Errorf("expected one layout row, got %d", rows)
	}
}

func TestDashboardLayoutRefusesWhatIsNotALayout(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAppPerms(t, 1, permissions.AppUserPreferencesRead, permissions.AppUserPreferencesUpdate)

	for name, body := range map[string]string{
		"not JSON":      `{"layout":"{nope"}`,
		"an array":      dashboardLayoutBody(`[1,2]`),
		"no version":    dashboardLayoutBody(`{"panels":[]}`),
		"text version":  dashboardLayoutBody(`{"version":"1"}`),
		"oversized":     dashboardLayoutBody(fmt.Sprintf(`{"version":1,"pad":"%s"}`, strings.Repeat("x", 17*1024))),
		"a broken body": `{"layout":`,
	} {
		w, r := shoppingListRequest("PUT", body, 1, nil)
		UpdateDashboardLayout(w, r)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d (%s)", name, w.Code, w.Body.String())
		}
	}

	var rows int64
	repositories.GetDB().Model(&models.DashboardLayout{}).Count(&rows)
	if rows != 0 {
		t.Errorf("nothing may be saved, got %d rows", rows)
	}
}

func TestDashboardLayoutIsEachUsersOwn(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAppPerms(t, 1, permissions.AppUserPreferencesRead, permissions.AppUserPreferencesUpdate)
	grantAppPerms(t, 2, permissions.AppUserPreferencesRead, permissions.AppUserPreferencesUpdate)

	w, r := shoppingListRequest("PUT", dashboardLayoutBody(`{"version":1,"owner":"one"}`), 1, nil)
	UpdateDashboardLayout(w, r)
	assertStatus(t, w, http.StatusOK)

	w, r = shoppingListRequest("GET", "", 2, nil)
	GetDashboardLayout(w, r)
	assertStatus(t, w, http.StatusOK)
	other := decodeShoppingListResponse[models.DashboardLayout](t, w)
	if other.Layout != "" || other.UserId != 2 {
		t.Errorf("user 2 must not see user 1's layout, got %+v", other)
	}
}

func TestDashboardLayoutNeedsThePreferencesPermissions(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAppPerms(t, 1)

	w, r := shoppingListRequest("GET", "", 1, nil)
	GetDashboardLayout(w, r)
	assertStatus(t, w, http.StatusForbidden)

	w, r = shoppingListRequest("PUT", dashboardLayoutBody(`{"version":1}`), 1, nil)
	UpdateDashboardLayout(w, r)
	assertStatus(t, w, http.StatusForbidden)
}
