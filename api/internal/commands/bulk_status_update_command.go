package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"
)

type BulkStatusUpdateCommand struct {
	Comment    string
	Status     models.ReceiptStatus
	ReceiptIds []uint
}

func (command *BulkStatusUpdateCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &command)
	if err != nil {
		return err
	}

	return nil
}
