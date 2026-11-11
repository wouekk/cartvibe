package handlers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func GetPagedGroups(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error retrieving groups.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppAccountRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.PagedGroupRequestCommand{}
			err := command.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			vErrs := command.Validate(r)
			if len(vErrs.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErrs, http.StatusBadRequest)
				return 0, nil
			}

			token := structs.GetClaims(r)

			// Listing every group in the system requires a dedicated permission,
			// resolved from the database (never trusted from the JWT).
			if command.GroupFilter.AssociatedGroup == commands.ASSOCIATED_GROUP_ALL {
				permissionService := services.NewPermissionService(nil)
				canReadAll, err := permissionService.HasAppPermissions(token.UserId, permissions.AppGroupsRead)
				if err != nil {
					return http.StatusInternalServerError, err
				}
				if !canReadAll {
					return http.StatusForbidden, errors.New("user is unauthorized to view all groups")
				}
			}

			userIdString := utils.UintToString(token.UserId)
			groupRepository := repositories.NewGroupRepository(nil)

			groups, count, err := groupRepository.GetPagedGroups(command, userIdString)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			anyData := make([]any, len(groups))
			for i := 0; i < len(groups); i++ {
				anyData[i] = groups[i]
			}

			bytes, err := utils.MarshalResponseData(structs.PagedData{
				TotalCount: count,
				Data:       anyData,
			})
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

func GetGroupsForUser(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error retrieving groups.",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppAccountRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			groupService := services.NewGroupService(nil)

			groups, err := groupService.GetGroupsForUser(utils.UintToString(token.UserId))
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// TODO: 12/1/2023 This is a way for ensure all users have an all group. We can remove this in a few months
			hasAllGroup := false
			for i := 0; i < len(groups); i++ {
				if groups[i].IsAllGroup {
					hasAllGroup = true
				}
			}

			if !hasAllGroup {
				groupsRepository := repositories.NewGroupRepository(nil)
				groupService := services.NewGroupService(nil)

				_, err := groupsRepository.CreateAllGroup(token.UserId)
				if err != nil {
					return http.StatusInternalServerError, err
				}

				groups, err = groupService.GetGroupsForUser(utils.UintToString(token.UserId))
				if err != nil {
					return http.StatusInternalServerError, err
				}
			}

			bytes, err := utils.MarshalResponseData(groups)
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

func GetGroupById(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:     "Error retrieving group.",
		Writer:           w,
		Request:          r,
		GroupId:          chi.URLParam(r, "groupId"),
		GroupPermissions: []string{permissions.GroupView},
		OrAppPermissions: []string{permissions.AppGroupsRead},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			id := chi.URLParam(r, "groupId")

			groupRepository := repositories.NewGroupRepository(nil)
			groups, err := groupRepository.GetGroupById(id, true, true)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(groups)
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

func CreateGroup(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error creating group",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppGroupsCreate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.UpsertGroupCommand{}
			err := command.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			vErrs := command.Validate(true)
			if len(vErrs.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErrs, http.StatusBadRequest)
				return 0, nil
			}

			token := structs.GetClaims(r)

			command.IsAllGroup = false
			groupRepository := repositories.NewGroupRepository(nil)
			group, err := groupRepository.CreateGroup(command, token.UserId)

			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(group)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			fileRepository := repositories.NewFileRepository(nil)
			groupPath, err := fileRepository.BuildGroupPath(group.ID)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// The household's folder of receipt files, data/<id>. Tolerant of one that is already there.
			err = utils.EnsureDataDirectory(groupPath)
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

// TODO: move hooks, and update swagger to take command
func UpdateGroup(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:     "Error updating group.",
		Writer:           w,
		Request:          r,
		GroupId:          chi.URLParam(r, "groupId"),
		GroupPermissions: []string{permissions.GroupUpdate},
		// An app admin edits any household, also one they only joined as a Member.
		OrAppPermissions: []string{permissions.AppGroupsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.UpsertGroupCommand{}
			err := command.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			vErrs := command.Validate(true)
			if len(vErrs.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErrs, http.StatusBadRequest)
				return 0, nil
			}
			groupId := chi.URLParam(r, "groupId")

			groupRepository := repositories.NewGroupRepository(nil)
			uintGroupId, err := utils.StringToUint(groupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			isAllGroup, err := groupRepository.IsAllGroup(uintGroupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if isAllGroup {
				return http.StatusBadRequest, errors.New("cannot update all group")
			}

			// Authorize the requested member/role changes before persisting them:
			// the caller must hold the relevant group.members.* permission and may
			// not grant or strip a role beyond their own privileges (self-escalation
			// / owner-eviction guard — GHSA-89mm-9qfv-cjg3).
			token := structs.GetClaims(r)
			groupService := services.NewGroupService(nil)
			err = groupService.AuthorizeGroupMemberChanges(token.UserId, uintGroupId, command.GroupMembers)
			if err != nil {
				if errors.Is(err, services.ErrGroupMemberChangeForbidden) {
					return http.StatusForbidden, err
				}
				return http.StatusInternalServerError, err
			}

			updatedGroup, err := groupRepository.UpdateGroup(command, groupId)

			if err != nil {
				return http.StatusInternalServerError, err
			}
			// The roster or the roles may have changed who sees the group's receipts.
			services.SyncWarrantyRemindersForGroupQuietly(updatedGroup.ID)

			bytes, err := utils.MarshalResponseData(updatedGroup)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(200)
			w.Write(bytes)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func UpdateGroupReceiptSettings(w http.ResponseWriter, r *http.Request) {
	groupId := chi.URLParam(r, "groupId")

	handler := structs.Handler{
		ErrorMessage:     "Error updating group receipt settings",
		Writer:           w,
		Request:          r,
		ResponseType:     constants.ApplicationJson,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupUpdate},
		OrAppPermissions: []string{permissions.AppGroupsUpdate},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.UpdateGroupReceiptSettingsCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}
			if err != nil {
				return http.StatusInternalServerError, err
			}

			groupReceiptSettingsRepository := repositories.NewGroupReceiptSettingsRepository(nil)
			updatedGroupReceiptSettings, err := groupReceiptSettingsRepository.UpdateGroupReceiptSettings(groupId, command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(updatedGroupReceiptSettings)
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

func DeleteGroup(w http.ResponseWriter, r *http.Request) {

	handler := structs.Handler{
		ErrorMessage:     "Error deleting group.",
		Writer:           w,
		Request:          r,
		GroupId:          chi.URLParam(r, "groupId"),
		GroupPermissions: []string{permissions.GroupDelete},
		// An administrator cleaning up abandoned or garbage groups is not a
		// member of them, so the group-scoped check can never pass. app.groups.delete
		// is the app-scoped counterpart to app.groups.read: see every group, and
		// remove the ones that shouldn't exist.
		OrAppPermissions: []string{permissions.AppGroupsDelete},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			id := chi.URLParam(r, "groupId")
			groupService := services.NewGroupService(nil)

			uintGroupId, err := utils.StringToUint(id)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			groupRepository := repositories.NewGroupRepository(nil)
			isAllGroup, err := groupRepository.IsAllGroup(uintGroupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if isAllGroup {
				return http.StatusBadRequest, errors.New("cannot delete all group")
			}

			err = groupService.DeleteGroup(id, false)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)

			return 0, nil
		},
	}

	HandleRequest(handler)
}
