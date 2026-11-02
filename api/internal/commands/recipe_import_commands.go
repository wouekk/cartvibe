package commands

import (
	"cartvibe/api/internal/structs"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/shopspring/decimal"
)

const (
	// maxRecipeRequestBytes bounds a request body; pasted text is the only large part.
	maxRecipeRequestBytes = 256 << 10
	maxRecipeTextBytes    = 200 << 10
	maxRecipeUrlLength    = 2048
	maxRecipeImportItems  = 100
	maxRecipeItemName     = 200
	maxRecipeItemUnit     = 50
)

var maxRecipeItemAmount = decimal.NewFromInt(100000)

// readCappedBody reads a small JSON body. tooLarge is true when it exceeded the cap, in which case the command
// reports a field error instead of failing the request.
func readCappedBody(w http.ResponseWriter, r *http.Request) (body []byte, tooLarge bool, err error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRecipeRequestBytes)
	body, err = io.ReadAll(r.Body)
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			return nil, true, nil
		}
		return nil, false, err
	}
	return body, false, nil
}

// PreviewShoppingListRecipeCommand asks for a recipe's ingredients, from a page (Url) or from pasted text (Text).
// Exactly one is given.
type PreviewShoppingListRecipeCommand struct {
	Url  string `json:"url"`
	Text string `json:"text"`

	tooLarge bool
}

func (command *PreviewShoppingListRecipeCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	body, tooLarge, err := readCappedBody(w, r)
	if err != nil {
		return err
	}
	if tooLarge {
		command.tooLarge = true
		return nil
	}

	if err := json.Unmarshal(body, command); err != nil {
		return err
	}
	command.Url = strings.TrimSpace(command.Url)
	command.Text = strings.TrimSpace(command.Text)
	return nil
}

func (command PreviewShoppingListRecipeCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{Errors: map[string]string{}}

	switch {
	case command.tooLarge:
		vErr.Errors["text"] = "Text is too long"
	case command.Url != "" && command.Text != "":
		vErr.Errors["text"] = "Send either a URL or text, not both"
	case command.Url == "" && command.Text == "":
		vErr.Errors["url"] = "A URL or text is required"
	case len(command.Url) > maxRecipeUrlLength:
		vErr.Errors["url"] = "URL is too long"
	case len(command.Text) > maxRecipeTextBytes:
		vErr.Errors["text"] = "Text is too long"
	}

	return vErr
}

func (command *PreviewShoppingListRecipeCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	if err := command.LoadDataFromRequest(w, r); err != nil {
		return structs.ValidatorError{}, err
	}
	return command.Validate(), nil
}

// ImportShoppingListRecipeItem is one selected preview row. Amount is already scaled; Unit is the recipe's own word
// for it (a plain string, never an enum).
type ImportShoppingListRecipeItem struct {
	Name   string           `json:"name"`
	Amount *decimal.Decimal `json:"amount"`
	Unit   string           `json:"unit"`
}

// ImportShoppingListRecipeCommand adds the selected rows to a list.
type ImportShoppingListRecipeCommand struct {
	Items []ImportShoppingListRecipeItem `json:"items"`

	tooLarge bool
}

func (command *ImportShoppingListRecipeCommand) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	body, tooLarge, err := readCappedBody(w, r)
	if err != nil {
		return err
	}
	if tooLarge {
		command.tooLarge = true
		return nil
	}

	if err := json.Unmarshal(body, command); err != nil {
		return err
	}
	for i := range command.Items {
		command.Items[i].Name = strings.TrimSpace(command.Items[i].Name)
		command.Items[i].Unit = strings.TrimSpace(command.Items[i].Unit)
	}
	return nil
}

func (command ImportShoppingListRecipeCommand) Validate() structs.ValidatorError {
	vErr := structs.ValidatorError{Errors: map[string]string{}}

	if command.tooLarge {
		vErr.Errors["items"] = "Too many items"
		return vErr
	}
	if len(command.Items) == 0 {
		vErr.Errors["items"] = "Select at least one item"
		return vErr
	}
	if len(command.Items) > maxRecipeImportItems {
		vErr.Errors["items"] = "Too many items"
		return vErr
	}

	for _, item := range command.Items {
		switch {
		case item.Name == "" || utf8.RuneCountInString(item.Name) > maxRecipeItemName:
			vErr.Errors["items"] = "Every item needs a name of at most 200 characters"
		case utf8.RuneCountInString(item.Unit) > maxRecipeItemUnit:
			vErr.Errors["items"] = "A unit is too long"
		case item.Amount != nil && (item.Amount.Sign() <= 0 || !item.Amount.LessThan(maxRecipeItemAmount) || !item.Amount.Round(3).Equal(*item.Amount)):
			vErr.Errors["items"] = "An amount must be above 0, below 100000, with at most 3 decimals"
		}
		if len(vErr.Errors) > 0 {
			break
		}
	}

	return vErr
}

func (command *ImportShoppingListRecipeCommand) LoadDataFromRequestAndValidate(w http.ResponseWriter, r *http.Request) (structs.ValidatorError, error) {
	if err := command.LoadDataFromRequest(w, r); err != nil {
		return structs.ValidatorError{}, err
	}
	return command.Validate(), nil
}
