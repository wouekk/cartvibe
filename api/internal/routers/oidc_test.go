package routers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRejectMobileClient(t *testing.T) {
	reached := false
	handler := rejectMobileClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	cases := []struct {
		query   string
		status  int
		reached bool
	}{
		{"client=mobile&codeChallenge=abc", http.StatusBadRequest, false},
		{"client=mobile", http.StatusBadRequest, false},
		{"client=desktop", http.StatusOK, true},
		{"", http.StatusOK, true},
	}

	for _, tc := range cases {
		reached = false
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/oidc/x/login?"+tc.query, nil))

		if recorder.Code != tc.status || reached != tc.reached {
			t.Fatalf("query %q: got status %d reached %v, want %d %v", tc.query, recorder.Code, reached, tc.status, tc.reached)
		}
	}
}
