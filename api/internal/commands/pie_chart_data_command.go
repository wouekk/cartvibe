package commands

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"net/http"
)

type PieChartDataCommand struct {
	ChartGrouping models.ChartGrouping      `json:"chartGrouping"`
	Filter        ReceiptPagedRequestFilter `json:"filter"`
}

func (command *PieChartDataCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &command)
	if err != nil {
		return err
	}

	initReceiptFilterValues(&command.Filter)
	return nil
}

func (command *PieChartDataCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{}
	errorMap := make(map[string]string)

	_, err := command.ChartGrouping.Value()
	if err != nil {
		errorMap["chartGrouping"] = "Invalid chart grouping. Must be CATEGORIES, TAGS, or PAIDBY"
	}

	vErr.Errors = errorMap
	return vErr
}
