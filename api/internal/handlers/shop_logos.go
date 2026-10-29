package handlers

import (
	"errors"
	"net/http"
	"os"

	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/shoplogos"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"

	"github.com/go-chi/chi/v5"
)

// shopLogoSummary is what the app needs to match a receipt's shop to a downloaded logo.
type shopLogoSummary struct {
	Slug    string   `json:"slug"`
	Name    string   `json:"name"`
	Aliases []string `json:"aliases"`
}

// GetShopLogos lists the brands whose logo is downloaded; [] without a Logo.dev key.
func GetShopLogos(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage: "Error getting shop logos.",
		Writer:       w,
		Request:      r,
		ResponseType: constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			store, _, err := services.ShopLogos()
			if err != nil {
				return http.StatusInternalServerError, err
			}

			logos := []shopLogoSummary{}
			for _, brand := range store.Available() {
				logos = append(logos, shopLogoSummary{Slug: brand.Slug, Name: brand.Name, Aliases: brand.Aliases})
			}

			bytes, err := utils.MarshalResponseData(logos)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			w.WriteHeader(http.StatusOK)
			w.Write(bytes)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

// GetShopLogo serves one downloaded logo as a PNG. Only brands in the list have a file, so the slug can never name
// another path; anything else is a 404.
func GetShopLogo(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage: "Error getting the shop logo.",
		Writer:       w,
		Request:      r,
		ResponseType: "",
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			store, _, err := services.ShopLogos()
			if err != nil {
				return http.StatusInternalServerError, err
			}

			data, err := store.ReadLogo(chi.URLParam(r, "slug"))
			if errors.Is(err, shoplogos.ErrUnknownBrand) || errors.Is(err, os.ErrNotExist) {
				w.WriteHeader(http.StatusNotFound)
				return 0, nil
			}
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			// A day in the browser: a logo rarely changes, and a removed key empties the list the app asks first.
			w.Header().Set("Cache-Control", "private, max-age=86400")
			w.WriteHeader(http.StatusOK)
			w.Write(data)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

// StartShopLogoSync fetches the missing logos now (the Fetch logos button) instead of at the next 12-hourly run. It
// answers at once with the status; the download runs in the background, and one already running is left alone.
func StartShopLogoSync(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error starting the shop logo download.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppSystemSettingsUpdate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			services.StartShopLogoSync()

			status, err := services.ShopLogoStatus()
			if err != nil {
				return http.StatusInternalServerError, err
			}
			bytes, err := utils.MarshalResponseData(status)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			w.WriteHeader(http.StatusAccepted)
			w.Write(bytes)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

// GetShopLogoStatus reports the logo download for System Settings → Shop Logos.
func GetShopLogoStatus(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting the shop logo status.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppSystemSettingsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			status, err := services.ShopLogoStatus()
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(status)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			w.WriteHeader(http.StatusOK)
			w.Write(bytes)
			return 0, nil
		},
	}

	HandleRequest(handler)
}
