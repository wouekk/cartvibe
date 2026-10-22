package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"fmt"
	"github.com/shopspring/decimal"
	"net/http"
	"time"
)

type UpsertReceiptCommand struct {
	Name     string `json:"name"`
	ShopName string `json:"shopName"`
	// Currency is what the AI read off the receipt (any spelling: "zł", "£", "CHF"); the server turns it
	// into a code and converts the amount. It is not stored as such.
	Currency         string                  `json:"currency"`
	OriginalAmount   *decimal.Decimal        `json:"originalAmount"`
	OriginalCurrency string                  `json:"originalCurrency"`
	ExchangeRate     *decimal.Decimal        `json:"exchangeRate"`
	Amount           decimal.Decimal         `json:"amount"`
	Date             time.Time               `json:"date"`
	GroupId          uint                    `json:"groupId"`
	PaidByUserID     uint                    `json:"paidByUserId"`
	Status           models.ReceiptStatus    `json:"status"`
	Categories       []UpsertCategoryCommand `json:"categories"`
	Tags             []UpsertTagCommand      `json:"tags"`
	Comments         []UpsertCommentCommand  `json:"comments"`
	CreatedByString  string                  `json:"createdByString"`
}

func (receipt *UpsertReceiptCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &receipt)
	if err != nil {
		return err
	}

	return nil
}

func (receipt *UpsertReceiptCommand) Validate(tokenUserId uint, isCreate bool) structs.ValidatorError {
	errors := make(map[string]string)
	vErr := structs.ValidatorError{}

	if len(receipt.Name) == 0 {
		errors["name"] = "Name is required"
	}

	if receipt.Date.IsZero() {
		errors["date"] = "Date is required"
	}

	if receipt.GroupId == 0 {
		errors["groupId"] = "Group Id is required"
	}

	if receipt.PaidByUserID == 0 {
		errors["paidByUserId"] = "Paid By User Id is required"
	}

	if receipt.Status == "" {
		errors["status"] = "Status is required"
	}

	for i, category := range receipt.Categories {
		basePath := "categories." + fmt.Sprintf("%d", i)
		categoryErrors := category.Validate()
		for key, value := range categoryErrors.Errors {
			errors[basePath+"."+key] = value
		}
	}

	for i, tag := range receipt.Tags {
		basePath := "tags." + fmt.Sprintf("%d", i)
		tagErrors := tag.Validate()
		for key, value := range tagErrors.Errors {
			errors[basePath+"."+key] = value
		}
	}

	for i, comment := range receipt.Comments {
		basePath := "comments." + fmt.Sprintf("%d", i)
		commentErrors := comment.Validate(tokenUserId, isCreate)
		for key, value := range commentErrors.Errors {
			errors[basePath+"."+key] = value
		}
	}

	vErr.Errors = errors
	return vErr
}

func (receipt *UpsertReceiptCommand) ToReceipt() (models.Receipt, error) {
	var result models.Receipt
	bytes, err := json.Marshal(receipt)
	if err != nil {
		return result, err
	}

	err = json.Unmarshal(bytes, &result)
	if err != nil {
		return result, err
	}

	return result, nil
}
