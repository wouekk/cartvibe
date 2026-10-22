package handlers

import (
	"net/http"
	"net/http/httptest"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

// Logout itself does not clear cookies — that's the
// RevokeRefreshToken middleware's job in the real route chain. So the
// handler just writes a 200.
func TestLogout_ReturnsOkWithoutClearingCookies(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/logout", nil)
	w := httptest.NewRecorder()

	Logout(w, r)

	if w.Result().StatusCode != http.StatusOK {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusOK)
	}

	for _, c := range w.Result().Cookies() {
		if c.Name == constants.JwtKey || c.Name == constants.RefreshTokenKey {
			utils.PrintTestError(t, "unexpected auth cookie on logout: "+c.Name, "no auth cookies")
		}
	}
}
