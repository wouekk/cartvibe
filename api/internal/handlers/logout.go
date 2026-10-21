package handlers

import (
	"net/http"
	"receipt-wrangler/api/internal/structs"
)

func Logout(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage: "Error logging out.",
		Writer:       w,
		Request:      r,
		ResponseType: "",
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}
