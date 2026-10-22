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
	"net/http"

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

// SetReceiptProductClassification is a person's correction of a receipt product's tags. The product
// is resolved to its receipt before authorizing, so the receipt's paid-by visibility applies and an
// unknown id gets the same 403 as a denial.
func SetReceiptProductClassification(w http.ResponseWriter, r *http.Request) {
	productId, err := utils.StringToUint(chi.URLParam(r, "productId"))
	var product models.ReceiptProduct
	if err == nil {
		err = repositories.GetDB().First(&product, productId).Error
	}
	if err != nil {
		utils.WriteCustomErrorResponse(w, unauthorizedEntityMessage, http.StatusForbidden)
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error correcting the product's tags",
		Writer:           w,
		Request:          r,
		ReceiptId:        utils.UintToString(product.ReceiptId),
		GroupPermissions: []string{permissions.GroupReceiptsUpdate},
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

			receipt, err := repositories.NewReceiptRepository(nil).GetReceiptById(utils.UintToString(product.ReceiptId))
			if err != nil {
				return http.StatusInternalServerError, err
			}

			updated, err := services.NewFoodClassificationService(nil).CorrectReceiptProduct(receipt.GroupId, product, command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			bytes, err := utils.MarshalResponseData(updated)
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

// loadReceiptProductOrDeny finds the product a request addresses. An unknown or malformed id answers
// the same 403 as a denial, so a response never says whether a product exists.
func loadReceiptProductOrDeny(w http.ResponseWriter, productIdParam string) (models.ReceiptProduct, bool) {
	var product models.ReceiptProduct

	productId, err := utils.StringToUint(productIdParam)
	if err == nil {
		err = repositories.GetDB().First(&product, productId).Error
	}
	if err != nil {
		utils.WriteCustomErrorResponse(w, unauthorizedEntityMessage, http.StatusForbidden)
		return product, false
	}

	return product, true
}

func writeReceiptProduct(w http.ResponseWriter, product models.ReceiptProduct) (int, error) {
	bytes, err := utils.MarshalResponseData(product)
	if err != nil {
		return http.StatusInternalServerError, err
	}

	w.WriteHeader(http.StatusOK)
	w.Write(bytes)
	return 0, nil
}

// AddReceiptProduct adds a product line the AI missed (Phase 3 C5). Addressed by receipt id, so
// HandleRequest applies the receipt's group permission and paid-by visibility.
func AddReceiptProduct(w http.ResponseWriter, r *http.Request) {
	receiptIdParam := chi.URLParam(r, "receiptId")

	handler := structs.Handler{
		ErrorMessage:     "Error adding the product",
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

			command := commands.UpsertReceiptProductCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if err := checkProductLabels(command.CategoryId, command.TagIds, &vErr); err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			product, err := repositories.NewReceiptProductRepository(nil).CreateProduct(receiptId, command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeReceiptProduct(w, product)
		},
	}

	HandleRequest(handler)
}

// checkProductLabels adds a validation error for a category or tag id that does not exist.
func checkProductLabels(categoryId *uint, tagIds []uint, vErr *structs.ValidatorError) error {
	if categoryId != nil {
		count, err := repositories.NewCategoryRepository(nil).CountByIds([]uint{*categoryId})
		if err != nil {
			return err
		}
		if count != 1 {
			vErr.Errors["categoryId"] = "Category not found"
		}
	}

	if len(tagIds) > 0 {
		count, err := repositories.NewTagsRepository(nil).CountByIds(tagIds)
		if err != nil {
			return err
		}
		if count != int64(len(tagIds)) {
			vErr.Errors["tagIds"] = "Tag not found"
		}
	}

	return nil
}

// UpdateReceiptProduct corrects a product line's name, amount, quantity, category or tags (Phase 3 C5).
func UpdateReceiptProduct(w http.ResponseWriter, r *http.Request) {
	product, ok := loadReceiptProductOrDeny(w, chi.URLParam(r, "productId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error updating the product",
		Writer:           w,
		Request:          r,
		ReceiptId:        utils.UintToString(product.ReceiptId),
		GroupPermissions: []string{permissions.GroupReceiptsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.UpsertReceiptProductCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if err := checkProductLabels(command.CategoryId, command.TagIds, &vErr); err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			updated, err := repositories.NewReceiptProductRepository(nil).UpdateProduct(product, command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeReceiptProduct(w, updated)
		},
	}

	HandleRequest(handler)
}

// SetReceiptProductLabels sets a product line's category and tags only (the pickers on each row), so it
// never renames the line or sends it back to be classified.
func SetReceiptProductLabels(w http.ResponseWriter, r *http.Request) {
	product, ok := loadReceiptProductOrDeny(w, chi.URLParam(r, "productId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error saving the product's category and tags",
		Writer:           w,
		Request:          r,
		ReceiptId:        utils.UintToString(product.ReceiptId),
		GroupPermissions: []string{permissions.GroupReceiptsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.SetReceiptProductLabelsCommand{}
			vErr, err := command.LoadDataFromRequestAndValidate(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if err := checkProductLabels(command.CategoryId, command.TagIds, &vErr); err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			updated, err := repositories.NewReceiptProductRepository(nil).SetProductLabels(product, command.CategoryId, command.TagIds)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeReceiptProduct(w, updated)
		},
	}

	HandleRequest(handler)
}

// DeleteReceiptProduct removes a product line (Phase 3 C5).
func DeleteReceiptProduct(w http.ResponseWriter, r *http.Request) {
	product, ok := loadReceiptProductOrDeny(w, chi.URLParam(r, "productId"))
	if !ok {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     "Error removing the product",
		Writer:           w,
		Request:          r,
		ReceiptId:        utils.UintToString(product.ReceiptId),
		GroupPermissions: []string{permissions.GroupReceiptsUpdate},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			err := repositories.NewReceiptProductRepository(nil).DeleteProduct(product)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}
