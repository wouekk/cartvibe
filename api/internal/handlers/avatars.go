package handlers

import (
	"errors"
	"io"
	"net/http"
	"time"

	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"

	"github.com/go-chi/chi/v5"
)

// avatarResponse answers an upload or a removal with the new avatarUpdatedAt (null once removed).
type avatarResponse struct {
	AvatarUpdatedAt *time.Time `json:"avatarUpdatedAt"`
}

// UploadAvatar stores the signed-in person's avatar photo (multipart field "file").
func UploadAvatar(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error saving the avatar.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppAccountUpdate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			// The body may carry the multipart framing on top of the file.
			r.Body = http.MaxBytesReader(w, r.Body, services.MaxAvatarBytes+(1<<20))
			if err := r.ParseMultipartForm(services.MaxAvatarBytes + (1 << 20)); err != nil {
				var tooLarge *http.MaxBytesError
				if errors.As(err, &tooLarge) {
					utils.WriteCustomErrorResponse(w, services.ErrAvatarTooLarge.Error(), http.StatusRequestEntityTooLarge)
					return 0, nil
				}
				return http.StatusBadRequest, err
			}

			file, _, err := r.FormFile("file")
			if err != nil {
				return http.StatusBadRequest, err
			}
			defer file.Close()

			data, err := io.ReadAll(io.LimitReader(file, services.MaxAvatarBytes+1))
			if err != nil {
				return http.StatusBadRequest, err
			}

			token := structs.GetClaims(r)
			savedAt, err := services.SaveUserAvatar(token.UserId, data)
			if errors.Is(err, services.ErrAvatarTooLarge) {
				utils.WriteCustomErrorResponse(w, err.Error(), http.StatusRequestEntityTooLarge)
				return 0, nil
			}
			if errors.Is(err, services.ErrAvatarType) {
				utils.WriteCustomErrorResponse(w, err.Error(), http.StatusBadRequest)
				return 0, nil
			}
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeAvatarResponse(w, &savedAt)
		},
	}

	HandleRequest(handler)
}

// DeleteAvatar removes the signed-in person's avatar photo; the initials show again.
func DeleteAvatar(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error removing the avatar.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppAccountUpdate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			if err := services.RemoveUserAvatar(token.UserId); err != nil {
				return http.StatusInternalServerError, err
			}
			return writeAvatarResponse(w, nil)
		},
	}

	HandleRequest(handler)
}

func writeAvatarResponse(w http.ResponseWriter, savedAt *time.Time) (int, error) {
	bytes, err := utils.MarshalResponseData(avatarResponse{AvatarUpdatedAt: savedAt})
	if err != nil {
		return http.StatusInternalServerError, err
	}
	w.WriteHeader(http.StatusOK)
	w.Write(bytes)
	return 0, nil
}

// GetUserAvatar serves a person's avatar photo to a signed-in viewer allowed to see that person. No photo, and a
// person the viewer may not see, are both a 404.
func GetUserAvatar(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage: "Error getting the avatar.",
		Writer:       w,
		Request:      r,
		ResponseType: "",
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			userId, err := utils.StringToUint(chi.URLParam(r, "id"))
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				return 0, nil
			}

			token := structs.GetClaims(r)
			data, contentType, err := services.ReadUserAvatar(token.UserId, userId)
			if errors.Is(err, services.ErrAvatarNotFound) {
				w.WriteHeader(http.StatusNotFound)
				return 0, nil
			}
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.Header().Set("Content-Type", contentType)
			w.Header().Set("X-Content-Type-Options", "nosniff")
			// The app asks with ?v=<avatarUpdatedAt>, so a new photo is a new address; a day in the browser is safe.
			w.Header().Set("Cache-Control", "private, max-age=86400")
			w.WriteHeader(http.StatusOK)
			w.Write(data)
			return 0, nil
		},
	}

	HandleRequest(handler)
}
