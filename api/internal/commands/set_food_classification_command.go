package commands

import (
	"encoding/json"
	"net/http"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"strings"
)

// SetFoodClassificationCommand is a person's correction of a product's tags. Health is required;
// seasonality is optional and, when empty, left as it was.
type SetFoodClassificationCommand struct {
	Health      string `json:"health"`
	Seasonality string `json:"seasonality"`
}

func (command *SetFoodClassificationCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &command)
	if err != nil {
		return err
	}

	command.Health = strings.ToUpper(strings.TrimSpace(command.Health))
	command.Seasonality = strings.ToUpper(strings.TrimSpace(command.Seasonality))
	return nil
}

func (command SetFoodClassificationCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{Errors: make(map[string]string)}

	if !models.IsHealthRating(command.Health) {
		vErr.Errors["health"] = "Health must be HEALTHY, MEDIUM, UNHEALTHY or NOT_FOOD"
	}
	if command.Seasonality != "" && !models.IsSeasonality(command.Seasonality) {
		vErr.Errors["seasonality"] = "Seasonality must be SEASONAL, OUT_OF_SEASON or NOT_PRODUCE"
	}

	return vErr
}

func (command *SetFoodClassificationCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		return structs.ValidatorError{}, err
	}

	return command.Validate(), nil
}
