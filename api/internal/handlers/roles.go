package handlers

import (
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"net/http"
)

// GetRoles lists the fixed roles, so the people pages can offer them by id.
// There is no create, update, delete or "make default": the roles are seeded
// from code (repositories.SeedSystemRoles).
func GetRoles(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error retrieving roles",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppRolesRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			roleService := services.NewRoleService(nil)
			roles, err := roleService.GetRoles()
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(&roles)
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
