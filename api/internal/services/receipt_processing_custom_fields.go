package services

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

// promptCustomField is what the AI sees of a custom field (Phase 3 F2): enough to pick the right
// one and fill it, nothing about who may see which receipt.
type promptCustomField struct {
	Id          uint                      `json:"id"`
	Name        string                    `json:"name"`
	Type        models.CustomFieldType    `json:"type"`
	Description string                    `json:"description,omitempty"`
	Options     []promptCustomFieldOption `json:"options,omitempty"`
}

type promptCustomFieldOption struct {
	Id    uint   `json:"id"`
	Value string `json:"value"`
}

func (service ReceiptProcessingService) getCustomFieldsString() (string, error) {
	customFields, err := repositories.NewCustomFieldRepository(nil).GetAllCustomFields()
	if err != nil {
		return "", err
	}

	return buildCustomFieldsString(customFields)
}

func buildCustomFieldsString(customFields []models.CustomField) (string, error) {
	view := make([]promptCustomField, 0, len(customFields))
	for _, customField := range customFields {
		entry := promptCustomField{
			Id:          customField.ID,
			Name:        customField.Name,
			Type:        customField.Type,
			Description: customField.Description,
		}
		for _, option := range customField.Options {
			entry.Options = append(entry.Options, promptCustomFieldOption{Id: option.ID, Value: option.Value})
		}
		view = append(view, entry)
	}

	bytes, err := json.Marshal(view)
	if err != nil {
		return "", err
	}

	return string(bytes), nil
}

// splitAiCustomFields takes the "customFields" key out of the AI's JSON answer and reads it
// leniently against the real custom fields. The rest of the answer is returned for the normal
// unmarshal, so one badly typed value (a date as prose, a made-up option) can never fail the whole
// receipt: it is simply dropped. Unknown ids, a second value for one field, and values that do not fit
// the field's type are dropped too.
func splitAiCustomFields(response string, customFields []models.CustomField) (string, []commands.UpsertCustomFieldValueCommand) {
	values := []commands.UpsertCustomFieldValueCommand{}

	var parts map[string]json.RawMessage
	if err := json.Unmarshal([]byte(response), &parts); err != nil {
		return response, values
	}

	raw, found := parts["customFields"]
	if !found {
		return response, values
	}
	delete(parts, "customFields")

	remaining, err := json.Marshal(parts)
	if err != nil {
		return response, values
	}

	var entries []map[string]interface{}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&entries); err != nil {
		return string(remaining), values
	}

	byId := make(map[uint]models.CustomField, len(customFields))
	for _, customField := range customFields {
		byId[customField.ID] = customField
	}

	seen := map[uint]struct{}{}
	for _, entry := range entries {
		id, ok := aiUint(entry["customFieldId"])
		if !ok {
			continue
		}
		customField, ok := byId[id]
		if !ok {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}

		value, ok := aiCustomFieldValue(customField, entry)
		if !ok {
			continue
		}
		seen[id] = struct{}{}
		values = append(values, value)
	}

	return string(remaining), values
}

func aiCustomFieldValue(customField models.CustomField, entry map[string]interface{}) (commands.UpsertCustomFieldValueCommand, bool) {
	value := commands.UpsertCustomFieldValueCommand{CustomFieldId: customField.ID}

	switch customField.Type {
	case models.TEXT:
		text := aiString(entry["stringValue"])
		if text == "" {
			return value, false
		}
		value.StringValue = &text
	case models.DATE:
		day, ok := parseAiDay(aiString(entry["dateValue"]))
		if !ok {
			return value, false
		}
		value.DateValue = &day
	case models.SELECT:
		optionId, ok := aiUint(entry["selectValue"])
		if !ok {
			return value, false
		}
		for _, option := range customField.Options {
			if option.ID == optionId {
				value.SelectValue = &optionId
				return value, true
			}
		}
		return value, false
	case models.CURRENCY:
		amount, err := decimal.NewFromString(strings.TrimSpace(aiString(entry["currencyValue"])))
		if err != nil {
			return value, false
		}
		value.CurrencyValue = &amount
	case models.BOOLEAN:
		switch typed := entry["booleanValue"].(type) {
		case bool:
			value.BooleanValue = &typed
		case string:
			parsed, err := strconv.ParseBool(strings.TrimSpace(typed))
			if err != nil {
				return value, false
			}
			value.BooleanValue = &parsed
		default:
			return value, false
		}
	default:
		return value, false
	}

	return value, true
}

func aiString(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	}
	return ""
}

func aiUint(value interface{}) (uint, bool) {
	parsed, err := strconv.ParseUint(aiString(value), 10, 32)
	if err != nil {
		return 0, false
	}
	return uint(parsed), true
}

// parseAiDay reads a calendar day as written and stores it as midnight UTC, like every receipt date.
func parseAiDay(text string) (time.Time, bool) {
	if len(text) >= 10 {
		parsed, err := time.Parse("2006-01-02", text[:10])
		if err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}
