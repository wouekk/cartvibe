package handlers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"net/http"

	"github.com/go-chi/chi/v5"
)

const allGroupShoppingListMessage = "Shopping lists cannot be used in the All group"

// rejectAllGroupShoppingList writes a 400 and returns false when groupId is the synthetic "All"
// group, which is never a destination. Lists addressed by their own id need no such check: none can
// exist in the All group, because every route that creates or reads by group runs this first.
func rejectAllGroupShoppingList(w http.ResponseWriter, groupId uint) (bool, error) {
	isAllGroup, err := repositories.NewGroupRepository(nil).IsAllGroup(groupId)
	if err != nil {
		return false, err
	}

	if isAllGroup {
		utils.WriteCustomErrorResponse(w, allGroupShoppingListMessage, http.StatusBadRequest)
		return false, nil
	}

	return true, nil
}

// resolveShoppingListGroupId loads the group a list belongs to, so the request can be authorized
// against it. An unknown or malformed id gets the same 403 a permission denial does, so the
// response never reveals whether the id exists.
func resolveShoppingListGroupId(w http.ResponseWriter, listIdParam string) (uint, uint, bool) {
	listId, err := utils.StringToUint(listIdParam)
	if err == nil {
		groupId, lookupErr := repositories.NewShoppingListRepository(nil).GetGroupIdForShoppingList(listId)
		if lookupErr == nil {
			return listId, groupId, true
		}
		err = lookupErr
	}

	logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
	utils.WriteCustomErrorResponse(w, unauthorizedEntityMessage, http.StatusForbidden)
	return 0, 0, false
}

// resolveShoppingListItemGroupId is resolveShoppingListGroupId for an item, through its list.
func resolveShoppingListItemGroupId(w http.ResponseWriter, itemIdParam string) (uint, uint, bool) {
	itemId, err := utils.StringToUint(itemIdParam)
	if err == nil {
		groupId, lookupErr := repositories.NewShoppingListRepository(nil).GetGroupIdForShoppingListItem(itemId)
		if lookupErr == nil {
			return itemId, groupId, true
		}
		err = lookupErr
	}

	logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
	utils.WriteCustomErrorResponse(w, unauthorizedEntityMessage, http.StatusForbidden)
	return 0, 0, false
}

func writeShoppingListResponse(w http.ResponseWriter, data any) (int, error) {
	bytes, err := utils.MarshalResponseData(data)
	if err != nil {
		return http.StatusInternalServerError, err
	}

	w.WriteHeader(http.StatusOK)
	w.Write(bytes)

	return 0, nil
}

func GetShoppingListsForGroup(w http.ResponseWriter, r *http.Request) {
	groupId := chi.URLParam(r, "groupId")

	handler := structs.Handler{
		ErrorMessage:     "Error retrieving shopping lists",
		Writer:           w,
		Request:          r,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupShoppingListsRead},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			uintGroupId, err := utils.StringToUint(groupId)
			if err != nil {
				return http.StatusBadRequest, err
			}

			ok, err := rejectAllGroupShoppingList(w, uintGroupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if !ok {
				return 0, nil
			}

			lists, err := services.NewShoppingListService(nil).GetShoppingListsForGroup(uintGroupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, lists)
		},
	}

	HandleRequest(handler)
}

func CreateShoppingList(w http.ResponseWriter, r *http.Request) {
	groupId := chi.URLParam(r, "groupId")

	handler := structs.Handler{
		ErrorMessage:     "Error creating shopping list",
		Writer:           w,
		Request:          r,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupShoppingListsCreate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			uintGroupId, err := utils.StringToUint(groupId)
			if err != nil {
				return http.StatusBadRequest, err
			}

			ok, err := rejectAllGroupShoppingList(w, uintGroupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if !ok {
				return 0, nil
			}

			command := commands.UpsertShoppingListCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			token := structs.GetClaims(r)
			list, err := services.NewShoppingListService(nil).CreateShoppingList(uintGroupId, command, token.UserId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, list)
		},
	}

	HandleRequest(handler)
}

func UpdateShoppingList(w http.ResponseWriter, r *http.Request) {
	listId, groupId, ok := resolveShoppingListGroupId(w, chi.URLParam(r, "listId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error updating shopping list",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.UpsertShoppingListCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			list, err := services.NewShoppingListService(nil).UpdateShoppingList(groupId, listId, command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, list)
		},
	}

	HandleRequest(handler)
}

func DeleteShoppingList(w http.ResponseWriter, r *http.Request) {
	listId, groupId, ok := resolveShoppingListGroupId(w, chi.URLParam(r, "listId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error deleting shopping list",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsDelete},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			err := services.NewShoppingListService(nil).DeleteShoppingList(groupId, listId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func AddShoppingListItem(w http.ResponseWriter, r *http.Request) {
	listId, groupId, ok := resolveShoppingListGroupId(w, chi.URLParam(r, "listId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error adding shopping list item",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.UpsertShoppingListItemCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			token := structs.GetClaims(r)
			item, err := services.NewShoppingListService(nil).AddShoppingListItem(groupId, listId, command, token.UserId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, item)
		},
	}

	HandleRequest(handler)
}

func UpdateShoppingListItem(w http.ResponseWriter, r *http.Request) {
	itemId, groupId, ok := resolveShoppingListItemGroupId(w, chi.URLParam(r, "itemId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error updating shopping list item",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.UpsertShoppingListItemCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			item, err := services.NewShoppingListService(nil).UpdateShoppingListItem(groupId, itemId, command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, item)
		},
	}

	HandleRequest(handler)
}

func SetShoppingListItemChecked(w http.ResponseWriter, r *http.Request) {
	itemId, groupId, ok := resolveShoppingListItemGroupId(w, chi.URLParam(r, "itemId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error updating shopping list item",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.SetShoppingListItemCheckedCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			token := structs.GetClaims(r)
			item, err := services.NewShoppingListService(nil).SetShoppingListItemChecked(groupId, itemId, *command.IsChecked, token.UserId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, item)
		},
	}

	HandleRequest(handler)
}

func DeleteShoppingListItem(w http.ResponseWriter, r *http.Request) {
	itemId, groupId, ok := resolveShoppingListItemGroupId(w, chi.URLParam(r, "itemId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error deleting shopping list item",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			err := services.NewShoppingListService(nil).DeleteShoppingListItem(groupId, itemId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func ClearCheckedShoppingListItems(w http.ResponseWriter, r *http.Request) {
	listId, groupId, ok := resolveShoppingListGroupId(w, chi.URLParam(r, "listId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error clearing crossed-off items",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			_, err := services.NewShoppingListService(nil).ClearCheckedShoppingListItems(groupId, listId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

// SetShoppingListItemClassification is a person's correction of an item's health and seasonality
// tags; it is remembered for the group and sent to the group's open lists.
func SetShoppingListItemClassification(w http.ResponseWriter, r *http.Request) {
	itemId, groupId, ok := resolveShoppingListItemGroupId(w, chi.URLParam(r, "itemId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error correcting the item's tags",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.SetFoodClassificationCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			item, err := services.NewFoodClassificationService(nil).CorrectShoppingListItem(groupId, itemId, command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, item)
		},
	}

	HandleRequest(handler)
}

// AnnounceGoingShopping tells the rest of the household the caller is going shopping, so they add
// what they need (Phase 3 S4). Anyone who may update the group's lists can do it.
func AnnounceGoingShopping(w http.ResponseWriter, r *http.Request) {
	groupId := chi.URLParam(r, "groupId")

	handler := structs.Handler{
		ErrorMessage:     "Error announcing the shopping trip",
		Writer:           w,
		Request:          r,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			uintGroupId, err := utils.StringToUint(groupId)
			if err != nil {
				return http.StatusBadRequest, err
			}

			ok, err := rejectAllGroupShoppingList(w, uintGroupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if !ok {
				return 0, nil
			}

			services.NewShoppingListService(nil).AnnounceGoingShopping(uintGroupId, structs.GetClaims(r).UserId)

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}
