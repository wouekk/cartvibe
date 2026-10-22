package handlers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func GetAllUsers(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error retrieving users.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUsersRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			userRepository := repositories.NewUserRepository(nil)
			users, err := userRepository.GetAllUserViews()
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := json.Marshal(users)
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

func GetPagedUsers(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error retrieving users.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUsersRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.PagedRequestCommand{}
			err := command.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			vErr := command.Validate()
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			userRepository := repositories.NewUserRepository(nil)
			users, count, err := userRepository.GetPagedUsers(command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			pagedData := structs.PagedData{}
			data := make([]interface{}, 0)
			for i := 0; i < len(users); i++ {
				data = append(data, users[i])
			}
			pagedData.TotalCount = count
			pagedData.Data = data

			responseBytes, err := utils.MarshalResponseData(pagedData)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

func CreateUser(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error creating user.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUsersCreate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			db := repositories.GetDB()
			var UserView structs.UserView
			bodyData := r.Context().Value("user").(commands.SignUpCommand)

			userRepository := repositories.NewUserRepository(nil)
			createdUser, err := userRepository.CreateUser(bodyData)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// TODO: Move to repo
			err = db.Model(models.User{}).Where("id = ?", createdUser.ID).Find(&UserView).Error
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(UserView)
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

func UpdateUser(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error updating user.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUsersUpdate},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			id := chi.URLParam(r, "id")
			bodyData := r.Context().Value("user").(commands.SignUpCommand)

			userRepository := repositories.NewUserRepository(nil)
			err := userRepository.UpdateUser(id, bodyData)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func GetUsernameCount(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage: "Error getting username count.",
		Writer:       w,
		Request:      r,
		ResponseType: constants.TextPlain,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			db := repositories.GetDB()
			username := chi.URLParam(r, "username")
			var result int64

			// TODO: user repo count func
			err := db.Model(models.User{}).Where("username = ?", username).Count(&result).Error
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(result)
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

func ResetPassword(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error resetting password.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUsersUpdate},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			db := repositories.GetDB()
			id := chi.URLParam(r, "id")
			resetPasswordData := r.Context().Value("reset_password").(structs.ResetPasswordCommand)

			// TODO: move to service
			hashedPassword, err := utils.HashPassword(resetPasswordData.Password)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			err = db.Model(models.User{}).Where("id = ?", id).UpdateColumn("password", hashedPassword).Error
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// The account now has a password, so it is no longer at risk of being
			// stranded by unlinking its last OIDC provider. Without this the lockout
			// guard's own advice -- "ask an administrator to set one before
			// disconnecting" -- is a dead end: the administrator complies and the unlink
			// is still refused, because nothing observed the reset.
			userId, err := utils.StringToUint(id)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			err = repositories.NewOidcIdentityRepository(nil).ClearProvisionedFlagForUser(userId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func ConvertDummyUserToNormalUser(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error converting user.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUsersUpdate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			var dbUser models.User
			db := repositories.GetDB()
			id := chi.URLParam(r, "id")
			resetPasswordData := r.Context().Value("reset_password").(structs.ResetPasswordCommand)

			err := db.Table("users").Where("id = ?", id).Find(&dbUser).Error
			if err != nil {
				return http.StatusInternalServerError, err
			}

			if !dbUser.IsDummyUser {
				return http.StatusInternalServerError, errors.New("user is already a normal user")
			}

			if len(resetPasswordData.Password) == 0 {
				return http.StatusInternalServerError, errors.New("password cannot be empty")
			}

			hashedPassword, err := utils.HashPassword(resetPasswordData.Password)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			err = db.Model(models.User{}).Where("id = ?", id).Updates(map[string]interface{}{"password": hashedPassword, "is_dummy_user": false}).Error
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(200)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func DeleteUser(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error Deleting User.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUsersDelete},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			id := chi.URLParam(r, "id")
			token := structs.GetClaims(r)
			if utils.UintToString(token.UserId) == id {
				return 500, errors.New("user cannot delete itself")
			}

			err := services.DeleteUser(id)
			if err != nil {
				return 500, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func GetClaimsForLoggedInUser(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting claims",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppAccountRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			services.PrepareAccessTokenClaims(*token)

			bytes, err := utils.MarshalResponseData(token)
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

func UpdateUserProfile(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error updating user profile",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppAccountUpdate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			db := repositories.GetDB()
			updateProfileCommand := r.Context().Value("updateProfileCommand").(commands.UpdateProfileCommand)

			if len(updateProfileCommand.DisplayName) == 0 {
				return http.StatusBadRequest, errors.New("displayName is undefined")
			}

			// TODO: move to repo
			err := db.Table("users").Where("id = ?", token.UserId).Updates(map[string]interface{}{"display_name": updateProfileCommand.DisplayName, "default_avatar_color": updateProfileCommand.DefaultAvatarColor}).Error
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func GetAppData(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting app data",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppAccountRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			appData, err := services.GetAppData(token.UserId, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(appData)
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

func BulkDeleteUsers(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error bulk deleting users",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppUsersDelete},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.BulkUserDeleteCommand{}
			err := command.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			token := structs.GetClaims(r)
			currentUserId := utils.UintToString(token.UserId)

			// Check if the current user is trying to delete themselves
			for _, userId := range command.UserIds {
				if userId == currentUserId {
					return http.StatusBadRequest, errors.New("user cannot delete itself")
				}
			}

			err = services.BulkDeleteUsers(command.UserIds)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func DeleteAccount(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error deleting account.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppAccountDelete},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)

			// Deleting the account is for the account's own session, never for a key
			// it issued, whatever that key's scope. Required-to-be-a-session rather
			// than refused-if-a-key, so an unmarked caller is denied too.
			if token.AuthSource != structs.AuthSourceJwt {
				return http.StatusForbidden, errors.New("an account may only be deleted by an interactive session")
			}

			command := r.Context().Value("deleteAccountCommand").(commands.DeleteAccountCommand)

			statusCode, err := services.DeleteAccountForUser(token.UserId, command)
			if err != nil {
				return statusCode, err
			}

			accessTokenCookie := services.GetEmptyAccessTokenCookie()
			refreshTokenCookie := services.GetEmptyRefreshTokenCookie()
			http.SetCookie(w, &accessTokenCookie)
			http.SetCookie(w, &refreshTokenCookie)

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}
