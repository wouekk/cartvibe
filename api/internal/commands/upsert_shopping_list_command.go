package commands

import (
	"encoding/json"
	"fmt"
	"net/http"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"strings"
	"unicode/utf8"
)

type UpsertShoppingListCommand struct {
	Name string `json:"name"`
}

func (command *UpsertShoppingListCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &command)
	if err != nil {
		return err
	}

	command.Name = strings.TrimSpace(command.Name)

	return nil
}

func (command UpsertShoppingListCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{
		Errors: make(map[string]string),
	}

	if len(command.Name) == 0 {
		vErr.Errors["name"] = "Name is required"
	} else if utf8.RuneCountInString(command.Name) > models.MaxShoppingListNameLength {
		vErr.Errors["name"] = fmt.Sprintf("Name must be %d characters or fewer", models.MaxShoppingListNameLength)
	}

	return vErr
}

func (command *UpsertShoppingListCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		return structs.ValidatorError{}, err
	}

	return command.Validate(), nil
}
