package middleware

import (
	"net/http"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

func CanDeleteGroup(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := structs.GetClaims(r)
		errMsg := "User must be a part of at least one group."

		// The rule below is self-protection for an ordinary user deleting their
		// own groups. It does not apply to an administrator cleaning up groups
		// across the system, who may not be a member of anything they delete.
		// Resolved from the database, never the JWT; a lookup failure denies.
		permissionService := services.NewPermissionService(nil)
		canDeleteAnyGroup, err := permissionService.HasAppPermissions(token.UserId, permissions.AppGroupsDelete)
		if err != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
			utils.WriteCustomErrorResponse(w, errMsg, http.StatusInternalServerError)
			return
		}
		if canDeleteAnyGroup {
			next.ServeHTTP(w, r)
			return
		}

		groupMemberRepository := repositories.NewGroupMemberRepository(nil)
		groupMembers, err := groupMemberRepository.GetGroupMembersByUserId(utils.UintToString(token.UserId))
		if err != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
			utils.WriteCustomErrorResponse(w, errMsg, http.StatusInternalServerError)
			return
		}

		if len(groupMembers) <= 1 {
			logging.LogStd(logging.LOG_LEVEL_ERROR, errMsg, r)
			utils.WriteCustomErrorResponse(w, errMsg, http.StatusInternalServerError)
			return
		}

		next.ServeHTTP(w, r)
	})
}
