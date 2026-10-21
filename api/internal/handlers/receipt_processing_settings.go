package handlers

import (
	"net/http"
	"receipt-wrangler/api/internal/ai"
	"receipt-wrangler/api/internal/commands"
	config "receipt-wrangler/api/internal/env"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/permissions"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/services"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"strings"

	"github.com/go-chi/chi/v5"
)

func GetPagedReceiptProcessingSettings(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting receipt processing settings",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppReceiptProcessingSettingsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.PagedRequestCommand{}
			err := command.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			vErr := command.Validate()
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			receiptProcessingSettingsRepository := repositories.NewReceiptProcessingSettings(nil)
			receiptProcessingSettings, count, err := receiptProcessingSettingsRepository.GetPagedReceiptProcessingSettings(command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			pagedData := structs.PagedData{}
			data := make([]interface{}, 0)
			for i := 0; i < len(receiptProcessingSettings); i++ {
				data = append(data, receiptProcessingSettings[i])
			}
			pagedData.Data = data
			pagedData.TotalCount = count

			responseBytes, err := utils.MarshalResponseData(pagedData)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

func CreateReceiptProcessingSettings(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error creating receipt processing settings",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppReceiptProcessingSettingsCreate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.UpsertReceiptProcessingSettingsCommand{}

			err := command.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			vErr, err := validateWithDefaultPrompt(&command, false)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			receiptProcessingSettingsRepository := repositories.NewReceiptProcessingSettings(nil)
			settings, err := receiptProcessingSettingsRepository.CreateReceiptProcessingSettings(command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// The first AI settings of an install become the ones System Settings points at, so a household
			// member without System Settings access can set the AI up on their own (the AI page).
			if _, err := repositories.NewSystemSettingsRepository(nil).LinkReceiptProcessingSettingsIfNone(settings.ID); err != nil {
				return http.StatusInternalServerError, err
			}

			responseBytes, err := utils.MarshalResponseData(settings)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

func GetReceiptProcessingSettingsById(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting receipt processing settings",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppReceiptProcessingSettingsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			id := chi.URLParam(r, "id")

			receiptProcessingSettingsRepository := repositories.NewReceiptProcessingSettings(nil)
			settings, err := receiptProcessingSettingsRepository.GetReceiptProcessingSettingsById(id)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			responseBytes, err := utils.MarshalResponseData(settings)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

func UpdateReceiptProcessingSettingsById(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error updating receipt processing settings",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppReceiptProcessingSettingsUpdate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			id := chi.URLParam(r, "id")
			updateKey := r.URL.Query().Get("updateKey") == "true"

			command := commands.UpsertReceiptProcessingSettingsCommand{}

			err := command.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			vErr, err := validateWithDefaultPrompt(&command, updateKey)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			receiptProcessingSettingsRepository := repositories.NewReceiptProcessingSettings(nil)
			settings, err := receiptProcessingSettingsRepository.UpdateReceiptProcessingSettingsById(id, updateKey, command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			responseBytes, err := utils.MarshalResponseData(settings)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

func DeleteReceiptProcessingSettingsById(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error deleting receipt processing settings",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppReceiptProcessingSettingsDelete},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			id := chi.URLParam(r, "id")

			receiptProcessingSettingsRepository := repositories.NewReceiptProcessingSettings(nil)
			err := receiptProcessingSettingsRepository.DeleteReceiptProcessingSettingsById(id)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func CheckReceiptProcessingSettingsConnectivity(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error checking connectivity",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppReceiptProcessingSettingsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			token := structs.GetClaims(r)
			command := commands.CheckReceiptProcessingSettingsCommand{}
			err := command.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			vErr := command.Validate()
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}
			var aiClient *services.AiService
			var decryptKey bool

			if command.ID > 0 && command.UpsertReceiptProcessingSettingsCommand.IsEmpty() {
				stringId := utils.UintToString(command.ID)

				client, clientErr := services.NewAiService(stringId)
				if clientErr != nil {
					return http.StatusInternalServerError, clientErr
				}

				aiClient = client
				decryptKey = true
			} else {
				receiptProcessingSettings := models.ReceiptProcessingSettings{
					BaseModel:                 models.BaseModel{ID: command.ID},
					Name:                      command.Name,
					Description:               command.Description,
					AiType:                    command.AiType,
					Url:                       command.Url,
					Key:                       command.Key,
					Model:                     command.Model,
					EnforceJsonResponseFormat: command.EnforceJsonResponseFormat,
					OcrEngine:                 &command.OcrEngine,
					PromptId:                  command.PromptId,
				}

				client := services.AiService{}
				client.ReceiptProcessingSettings = receiptProcessingSettings

				aiClient = &client
				decryptKey = false
			}

			systemTask, err := aiClient.CheckConnectivity(token.UserId, decryptKey)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			responseBytes, err := utils.MarshalResponseData(systemTask)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

// GetGeminiModels lists the content-generating models a Gemini key can use, so the AI page can offer a dropdown
// instead of a free-text model name. A key typed on the page is used as sent; otherwise the stored key of the named
// settings is decrypted. The key is never stored or logged here.
func GetGeminiModels(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error listing Gemini models",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppReceiptProcessingSettingsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.GeminiModelsCommand{}
			if err := command.LoadDataFromRequest(w, r); err != nil {
				return http.StatusBadRequest, err
			}

			vErr := command.Validate()
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			key := strings.TrimSpace(command.Key)
			if key == "" {
				settings, err := repositories.NewReceiptProcessingSettings(nil).
					GetReceiptProcessingSettingsById(utils.UintToString(command.ReceiptProcessingSettingsId))
				if err != nil {
					return http.StatusBadRequest, err
				}
				if len(settings.Key) > 0 {
					key, err = utils.DecryptB64EncodedData(config.GetEncryptionKey(), settings.Key)
					if err != nil {
						return http.StatusInternalServerError, err
					}
				}
			}

			models, err := ai.ListGeminiModels(r.Context(), nil, ai.GeminiModelsBaseUrl, key)
			if err != nil {
				structs.WriteValidatorErrorResponse(w, structs.ValidatorError{Errors: map[string]string{"key": err.Error()}}, http.StatusBadRequest)
				return 0, nil
			}

			responseBytes, err := utils.MarshalResponseData(models)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

// validateWithDefaultPrompt validates the command, pointing settings saved without a prompt at the
// default one (Phase 3 A3: the AI page has no prompt to pick, since every read uses the built-in
// prompt). The default prompt is only created once the rest of the command is valid.
func validateWithDefaultPrompt(
	command *commands.UpsertReceiptProcessingSettingsCommand,
	updateKey bool,
) (structs.ValidatorError, error) {
	vErr := command.Validate(updateKey)
	if _, missingPrompt := vErr.Errors["promptId"]; !missingPrompt || len(vErr.Errors) > 1 || command.PromptId > 0 {
		return vErr, nil
	}

	prompt, err := services.NewPromptService(nil).EnsureDefaultPrompt()
	if err != nil {
		return vErr, err
	}

	command.PromptId = prompt.ID
	return command.Validate(updateKey), nil
}
