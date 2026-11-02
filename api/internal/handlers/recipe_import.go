package handlers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// recipeImportService is a package variable so tests can point the fetcher at local servers.
var recipeImportService = services.NewRecipeImportService

// PreviewShoppingListRecipe parses a recipe page or pasted text into ingredient rows. It writes nothing; the
// group is the destination the person is importing into, and the permission is the one adding items needs.
func PreviewShoppingListRecipe(w http.ResponseWriter, r *http.Request) {
	groupId := chi.URLParam(r, "groupId")

	handler := structs.Handler{
		ErrorMessage:     "Error reading the recipe",
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

			command := commands.PreviewShoppingListRecipeCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusBadRequest, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			preview := recipeImportService(nil).Preview(r.Context(), command)
			return writeShoppingListResponse(w, services.NewRecipePreview(preview))
		},
	}

	HandleRequest(handler)
}

// ImportShoppingListRecipe merges the chosen rows into a list: sums onto matching items, revives crossed-off ones and
// inserts the rest.
func ImportShoppingListRecipe(w http.ResponseWriter, r *http.Request) {
	listId, groupId, ok := resolveShoppingListGroupId(w, chi.URLParam(r, "listId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error adding the recipe to the list",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.ImportShoppingListRecipeCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusBadRequest, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			token := structs.GetClaims(r)
			result, err := recipeImportService(nil).ImportItems(groupId, listId, token.UserId, command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, result)
		},
	}

	HandleRequest(handler)
}
