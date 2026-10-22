package handlers

import (
	"errors"
	"io"
	"net/http"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"

	"github.com/go-chi/chi/v5"
)

// resolveShoppingTripGroupId is resolveShoppingListGroupId for a trip, through its list.
func resolveShoppingTripGroupId(w http.ResponseWriter, tripIdParam string) (uint, uint, bool) {
	tripId, err := utils.StringToUint(tripIdParam)
	if err == nil {
		groupId, lookupErr := repositories.NewShoppingTripRepository(nil).GetGroupIdForTrip(tripId)
		if lookupErr == nil {
			return tripId, groupId, true
		}
		err = lookupErr
	}

	logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
	utils.WriteCustomErrorResponse(w, unauthorizedEntityMessage, http.StatusForbidden)
	return 0, 0, false
}

// GetShoppingTrips returns a list's recent trips. A trip shows its receipt and what was bought off
// the list, so it needs receipt read access as well as the list's.
func GetShoppingTrips(w http.ResponseWriter, r *http.Request) {
	listId, groupId, ok := resolveShoppingListGroupId(w, chi.URLParam(r, "listId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error retrieving shopping trips",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsRead, permissions.GroupReceiptsRead},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			trips, err := services.NewShoppingTripService(nil).GetTripsForList(listId, token.UserId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, trips)
		},
	}

	HandleRequest(handler)
}

// AttachShoppingTripReceipt attaches an existing receipt to a list. Both the list's group and the
// receipt are authorized (the receipt with its paid-by visibility), so an unknown or hidden receipt
// is the same 403 as a denial.
func AttachShoppingTripReceipt(w http.ResponseWriter, r *http.Request) {
	listId, groupId, ok := resolveShoppingListGroupId(w, chi.URLParam(r, "listId"))
	if !ok {
		return
	}

	command := commands.AttachShoppingTripReceiptCommand{}
	vErr, err := command.LoadDataFromRequestAndValidate(w, r)
	if err != nil {
		utils.WriteCustomErrorResponse(w, "Error attaching the receipt", http.StatusBadRequest)
		return
	}
	if len(vErr.Errors) > 0 {
		structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error attaching the receipt",
		Writer:           w,
		Request:          r,
		GroupIds:         []string{utils.UintToString(groupId)},
		ReceiptId:        utils.UintToString(command.ReceiptId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate, permissions.GroupReceiptsRead},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			trip, err := services.NewShoppingTripService(nil).AttachReceipt(groupId, listId, command.ReceiptId, token.UserId)
			if writeShoppingTripUserError(w, err) {
				return 0, nil
			}
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, trip)
		},
	}

	HandleRequest(handler)
}

// UploadShoppingTripPhoto starts a trip from a receipt photo. The photo becomes a receipt the way
// Quick Scan does, so it needs the quick-scan permission; unlike Quick Scan it waits as long as the
// AI is unavailable instead of failing.
func UploadShoppingTripPhoto(w http.ResponseWriter, r *http.Request) {
	listId, groupId, ok := resolveShoppingListGroupId(w, chi.URLParam(r, "listId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error uploading the receipt photo",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate, permissions.GroupReceiptsQuickScan},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)

			// The photo is scanned later, with no one to ask for a comment, so a role that requires one
			// has to use Quick Scan instead.
			requirements, err := services.NewReceiptService(nil).ResolveReceiptRequirements(token.UserId, groupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if requirements.CommentRequired {
				utils.WriteCustomErrorResponse(w, "Your role requires a comment on receipts; use Quick Scan for this receipt", http.StatusBadRequest)
				return 0, nil
			}

			r.Body = http.MaxBytesReader(w, r.Body, constants.MultipartFormMaxSize)
			file, header, err := r.FormFile("file")
			if err != nil {
				utils.WriteCustomErrorResponse(w, "Choose a photo or PDF of the receipt", http.StatusBadRequest)
				return 0, nil
			}
			defer file.Close()

			fileBytes, err := io.ReadAll(file)
			if err != nil {
				utils.WriteCustomErrorResponse(w, "The file could not be read", http.StatusBadRequest)
				return 0, nil
			}

			trip, err := services.NewShoppingTripService(nil).UploadPhoto(groupId, listId, fileBytes, header.Filename, token.UserId)
			if writeShoppingTripUserError(w, err) {
				return 0, nil
			}
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeShoppingListResponse(w, trip)
		},
	}

	HandleRequest(handler)
}

// DetachShoppingTrip removes a trip from its list. The receipt stays.
func DetachShoppingTrip(w http.ResponseWriter, r *http.Request) {
	tripId, groupId, ok := resolveShoppingTripGroupId(w, chi.URLParam(r, "tripId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error removing the receipt from the list",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			err := services.NewShoppingTripService(nil).DetachTrip(groupId, tripId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

// RetryShoppingTrip gives a failed trip another try.
func RetryShoppingTrip(w http.ResponseWriter, r *http.Request) {
	tripId, groupId, ok := resolveShoppingTripGroupId(w, chi.URLParam(r, "tripId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error retrying the trip",
		Writer:           w,
		Request:          r,
		GroupId:          utils.UintToString(groupId),
		GroupPermissions: []string{permissions.GroupShoppingListsUpdate},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			err := services.NewShoppingTripService(nil).RetryTrip(groupId, tripId)
			if writeShoppingTripUserError(w, err) {
				return 0, nil
			}
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

// shoppingTripUserErrors are the trip failures a person can act on, with what to tell them.
var shoppingTripUserErrors = []struct {
	err     error
	message string
}{
	{services.ErrTripReceiptInOtherGroup, "The receipt belongs to another group"},
	{services.ErrReceiptAlreadyOnTrip, "The receipt is already attached to a shopping list"},
	{services.ErrTripPhotoInvalid, "Choose a photo or PDF of the receipt"},
	{services.ErrTripNotFailed, "Only a receipt whose check failed can be tried again"},
}

// writeShoppingTripUserError writes a 400 for a failure the person can act on, and says whether it did.
func writeShoppingTripUserError(w http.ResponseWriter, err error) bool {
	for _, userError := range shoppingTripUserErrors {
		if errors.Is(err, userError.err) {
			utils.WriteCustomErrorResponse(w, userError.message, http.StatusBadRequest)
			return true
		}
	}
	return false
}
