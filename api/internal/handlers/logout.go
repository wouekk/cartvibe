package handlers

import (
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"net/http"
)

// Logout ends the session of the browser that asks: the route's middleware has retired its refresh token, and the
// cookies are cleared here, so the access token does not stay behind in the browser until it runs out.
func Logout(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage: "Error logging out.",
		Writer:       w,
		Request:      r,
		ResponseType: "",
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			clearSessionCookies(w)
			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

// SignOutEverywhere ends every session of the signed-in person: each browser they are signed in on and each
// assistant they connected (MCP). It needs no permission beyond being signed in, since it only ever touches the
// caller's own sessions. Another device keeps working until its access token runs out (20 minutes at most) and is
// then refused a new one.
func SignOutEverywhere(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage: "Error signing out everywhere.",
		Writer:       w,
		Request:      r,
		ResponseType: "",
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)

			if _, err := repositories.RevokeRefreshTokensForUser(repositories.GetDB(), token.UserId); err != nil {
				return http.StatusInternalServerError, err
			}

			clearSessionCookies(w)
			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func clearSessionCookies(w http.ResponseWriter) {
	services.ClearSessionCookies(w)
}
