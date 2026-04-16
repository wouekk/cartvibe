package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func invokeValidateLoginData(t *testing.T, userData commands.LoginCommand) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, "/api/login", nil)
	r = r.WithContext(context.WithValue(r.Context(), "user", userData))
	w := httptest.NewRecorder()
	handler := ValidateLoginData(createFakeHandler())
	handler.ServeHTTP(w, r)
	return w
}

func TestValidateLoginData_Valid(t *testing.T) {
	w := invokeValidateLoginData(t, commands.LoginCommand{
		Username: "user",
		Password: "password",
	})

	if w.Result().StatusCode != http.StatusOK {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusOK)
	}
}

func TestValidateLoginData_EmptyUsername(t *testing.T) {
	w := invokeValidateLoginData(t, commands.LoginCommand{
		Username: "",
		Password: "password",
	})

	if w.Result().StatusCode != http.StatusBadRequest {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusBadRequest)
	}

	errors := map[string]string{}
	if err := json.NewDecoder(w.Result().Body).Decode(&errors); err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if _, ok := errors["username"]; !ok {
		utils.PrintTestError(t, "missing username error", "username key present")
	}
	if _, ok := errors["password"]; ok {
		utils.PrintTestError(t, "password error unexpectedly present", "no password key")
	}
}

func TestValidateLoginData_EmptyPassword(t *testing.T) {
	w := invokeValidateLoginData(t, commands.LoginCommand{
		Username: "user",
		Password: "",
	})

	if w.Result().StatusCode != http.StatusBadRequest {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusBadRequest)
	}

	errors := map[string]string{}
	if err := json.NewDecoder(w.Result().Body).Decode(&errors); err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if _, ok := errors["password"]; !ok {
		utils.PrintTestError(t, "missing password error", "password key present")
	}
	if _, ok := errors["username"]; ok {
		utils.PrintTestError(t, "username error unexpectedly present", "no username key")
	}
}

func TestValidateLoginData_BothEmpty(t *testing.T) {
	w := invokeValidateLoginData(t, commands.LoginCommand{
		Username: "",
		Password: "",
	})

	if w.Result().StatusCode != http.StatusBadRequest {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusBadRequest)
	}

	errors := map[string]string{}
	if err := json.NewDecoder(w.Result().Body).Decode(&errors); err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if _, ok := errors["username"]; !ok {
		utils.PrintTestError(t, "missing username error", "username key present")
	}
	if _, ok := errors["password"]; !ok {
		utils.PrintTestError(t, "missing password error", "password key present")
	}
}
