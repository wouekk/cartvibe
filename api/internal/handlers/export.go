package handlers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func ExportAllReceiptsFromGroup(w http.ResponseWriter, r *http.Request) {
	groupId := chi.URLParam(r, "groupId")
	handler := structs.Handler{
		ErrorMessage:     "Error exporting receipts",
		Writer:           w,
		Request:          r,
		ResponseType:     constants.ApplicationZip,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupReceiptsRead},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			pagedRequest := commands.ReceiptPagedRequestCommand{}
			err := pagedRequest.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			vErrs := pagedRequest.Validate()
			if len(vErrs.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErrs, http.StatusBadRequest)
				return 0, nil
			}

			token := structs.GetClaims(r)
			permissionService := services.NewPermissionService(nil)

			receiptRepository := repositories.NewReceiptRepository(nil)
			receipts, _, err := receiptRepository.
				GetPagedReceiptsByGroupId(
					token.UserId,
					groupId,
					pagedRequest,
					getExportReceiptAssociations(),
					permissionService.GroupPermissionResolver(token.UserId, permissions.GroupReceiptsRead),
				)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			receiptCsvService := services.NewReceiptCsvService()
			zip, err := receiptCsvService.GetZippedCsvFiles(receipts)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.Header().Set("Content-Disposition", "attachment; filename=data.zip")
			w.WriteHeader(http.StatusOK)
			w.Write(zip)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

func ExportReceiptsById(w http.ResponseWriter, r *http.Request) {
	err := r.ParseForm()
	receiptIds := r.Form["receiptIds"]

	handler := structs.Handler{
		ErrorMessage:     "Error exporting receipts",
		Writer:           w,
		Request:          r,
		ResponseType:     constants.ApplicationZip,
		ReceiptIds:       receiptIds,
		GroupPermissions: []string{permissions.GroupReceiptsRead},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			if err != nil {
				return http.StatusInternalServerError, err
			}

			receiptRepository := repositories.NewReceiptRepository(nil)
			receipts, err := receiptRepository.GetReceiptsByIds(receiptIds, getExportReceiptAssociations())
			if err != nil {
				return http.StatusInternalServerError, err
			}

			receiptCsvService := services.NewReceiptCsvService()
			zip, err := receiptCsvService.GetZippedCsvFiles(receipts)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.Header().Set("Content-Disposition", "attachment; filename=data.zip")
			w.WriteHeader(http.StatusOK)
			w.Write(zip)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

func getExportReceiptAssociations() []string {
	return []string{
		"PaidByUser",
	}
}
