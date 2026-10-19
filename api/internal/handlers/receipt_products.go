package handlers

import (
	"net/http"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/permissions"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"

	"github.com/go-chi/chi/v5"
)

const receiptProductsNotQueued = "NOT_QUEUED"

func writeReceiptProductsView(w http.ResponseWriter, receiptId uint) (int, error) {
	products, extraction, err := repositories.NewReceiptProductRepository(nil).GetReceiptProducts(receiptId)
	if err != nil {
		return http.StatusInternalServerError, err
	}

	view := structs.ReceiptProductsView{Status: receiptProductsNotQueued, Products: products}
	if extraction != nil {
		view.Status = string(extraction.Status)
		view.LastError = extraction.LastError
	}

	bytes, err := utils.MarshalResponseData(view)
	if err != nil {
		return http.StatusInternalServerError, err
	}

	w.WriteHeader(http.StatusOK)
	w.Write(bytes)
	return 0, nil
}

// GetReceiptProducts returns a receipt's products. Addressed by receipt id, so HandleRequest also
// applies the paid-by visibility check, and an unknown id is the same 403 as a denial.
func GetReceiptProducts(w http.ResponseWriter, r *http.Request) {
	receiptIdParam := chi.URLParam(r, "receiptId")

	handler := structs.Handler{
		ErrorMessage:     "Error getting receipt products",
		Writer:           w,
		Request:          r,
		ReceiptId:        receiptIdParam,
		GroupPermissions: []string{permissions.GroupReceiptsRead},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			receiptId, err := utils.StringToUint(receiptIdParam)
			if err != nil {
				return http.StatusBadRequest, err
			}

			return writeReceiptProductsView(w, receiptId)
		},
	}

	HandleRequest(handler)
}

// ReadReceiptProducts queues a receipt to have its products read again, e.g. after a failed read.
func ReadReceiptProducts(w http.ResponseWriter, r *http.Request) {
	receiptIdParam := chi.URLParam(r, "receiptId")

	handler := structs.Handler{
		ErrorMessage:     "Error queueing receipt products",
		Writer:           w,
		Request:          r,
		ReceiptId:        receiptIdParam,
		GroupPermissions: []string{permissions.GroupReceiptsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			receiptId, err := utils.StringToUint(receiptIdParam)
			if err != nil {
				return http.StatusBadRequest, err
			}

			err = repositories.NewReceiptProductRepository(nil).MarkReceiptProductsPending(receiptId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeReceiptProductsView(w, receiptId)
		},
	}

	HandleRequest(handler)
}

// QueueGroupReceiptProducts is the backfill: it queues every receipt in the group that has an image
// but has never had its products read. The synthetic "All" group is rejected; queue each real group.
func QueueGroupReceiptProducts(w http.ResponseWriter, r *http.Request) {
	groupIdParam := chi.URLParam(r, "groupId")

	handler := structs.Handler{
		ErrorMessage:     "Error queueing receipt products",
		Writer:           w,
		Request:          r,
		GroupId:          groupIdParam,
		GroupPermissions: []string{permissions.GroupReceiptsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			groupId, err := utils.StringToUint(groupIdParam)
			if err != nil {
				return http.StatusBadRequest, err
			}

			isAllGroup, err := repositories.NewGroupRepository(nil).IsAllGroup(groupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if isAllGroup {
				utils.WriteCustomErrorResponse(w, "Choose a group to read older receipts for", http.StatusBadRequest)
				return 0, nil
			}

			queued, err := repositories.NewReceiptProductRepository(nil).QueueUnreadReceiptsInGroup(groupId)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(structs.QueuedReceiptsView{Queued: queued})
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
