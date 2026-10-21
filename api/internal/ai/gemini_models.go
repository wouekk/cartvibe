package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// GeminiModelsBaseUrl is where Google lists the models a key may use.
const GeminiModelsBaseUrl = "https://generativelanguage.googleapis.com/v1beta/models"

// GeminiModel is one model a key can call for content generation.
type GeminiModel struct {
	// Name is what the settings store and the API takes, without the "models/" prefix ("gemini-2.5-flash").
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type geminiModelsPage struct {
	Models []struct {
		Name                       string   `json:"name"`
		DisplayName                string   `json:"displayName"`
		SupportedGenerationMethods []string `json:"supportedGenerationMethods"`
	} `json:"models"`
	NextPageToken string `json:"nextPageToken"`
}

// ListGeminiModels asks Google which models the key can use and returns the ones that generate content, newest
// version first. The key travels in a header, never in the URL, so it cannot end up in a log line. baseUrl and client
// are parameters so tests can point at a local server.
func ListGeminiModels(ctx context.Context, client *http.Client, baseUrl string, apiKey string) ([]GeminiModel, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil, fmt.Errorf("an API key is required to list the models")
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}

	models := []GeminiModel{}
	pageToken := ""
	for pages := 0; pages < 10; pages++ {
		query := url.Values{"pageSize": {"200"}}
		if pageToken != "" {
			query.Set("pageToken", pageToken)
		}

		request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseUrl+"?"+query.Encode(), nil)
		if err != nil {
			return nil, err
		}
		request.Header.Set("x-goog-api-key", apiKey)

		response, err := client.Do(request)
		if err != nil {
			return nil, fmt.Errorf("could not reach Google: %w", err)
		}
		body, readErr := io.ReadAll(io.LimitReader(response.Body, 4<<20))
		response.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		if response.StatusCode == http.StatusBadRequest || response.StatusCode == http.StatusForbidden || response.StatusCode == http.StatusUnauthorized {
			return nil, fmt.Errorf("Google did not accept the key (status %d)", response.StatusCode)
		}
		if response.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("Google answered with status %d", response.StatusCode)
		}

		var page geminiModelsPage
		if err := json.Unmarshal(body, &page); err != nil {
			return nil, fmt.Errorf("could not read Google's answer: %w", err)
		}
		for _, model := range page.Models {
			if !supportsGenerateContent(model.SupportedGenerationMethods) {
				continue
			}
			name := strings.TrimPrefix(model.Name, "models/")
			displayName := strings.TrimSpace(model.DisplayName)
			if displayName == "" {
				displayName = name
			}
			models = append(models, GeminiModel{Name: name, DisplayName: displayName})
		}

		if page.NextPageToken == "" {
			break
		}
		pageToken = page.NextPageToken
	}

	sortGeminiModels(models)
	return models, nil
}

func supportsGenerateContent(methods []string) bool {
	for _, method := range methods {
		if method == "generateContent" {
			return true
		}
	}
	return false
}

var geminiVersionPattern = regexp.MustCompile(`gemini-(\d+(?:\.\d+)?)`)

// geminiVersion reads the version out of a model name ("gemini-2.5-flash" is 2.5); 0 when there is none.
func geminiVersion(name string) float64 {
	match := geminiVersionPattern.FindStringSubmatch(name)
	if match == nil {
		return 0
	}
	version, err := strconv.ParseFloat(match[1], 64)
	if err != nil {
		return 0
	}
	return version
}

// sortGeminiModels puts the newest versions first; within a version the plain names come before dated and preview
// variants, then alphabetical, so the order is stable.
func sortGeminiModels(models []GeminiModel) {
	sort.SliceStable(models, func(i, j int) bool {
		versionI, versionJ := geminiVersion(models[i].Name), geminiVersion(models[j].Name)
		if versionI != versionJ {
			return versionI > versionJ
		}
		variantI, variantJ := isVariant(models[i].Name), isVariant(models[j].Name)
		if variantI != variantJ {
			return !variantI
		}
		return models[i].Name < models[j].Name
	})
}

func isVariant(name string) bool {
	return strings.Contains(name, "preview") || strings.Contains(name, "exp") || regexp.MustCompile(`-\d{3,}$`).MatchString(name) || strings.Contains(name, "-latest")
}
