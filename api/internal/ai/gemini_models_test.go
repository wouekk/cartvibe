package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListGeminiModels_KeepsGenerativeModelsNewestFirstAndFollowsPages(t *testing.T) {
	var keys []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		keys = append(keys, r.Header.Get("x-goog-api-key"))
		if r.URL.Query().Get("key") != "" {
			t.Error("the key must not be sent in the URL")
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Query().Get("pageToken") == "" {
			w.Write([]byte(`{"models":[
				{"name":"models/gemini-1.5-pro","displayName":"Gemini 1.5 Pro","supportedGenerationMethods":["generateContent"]},
				{"name":"models/text-embedding-004","displayName":"Embedding","supportedGenerationMethods":["embedContent"]},
				{"name":"models/gemini-2.5-flash-preview-05-20","displayName":"Gemini 2.5 Flash Preview","supportedGenerationMethods":["generateContent"]}
			],"nextPageToken":"next"}`))
			return
		}
		w.Write([]byte(`{"models":[
			{"name":"models/gemini-2.5-flash","displayName":"Gemini 2.5 Flash","supportedGenerationMethods":["generateContent","countTokens"]},
			{"name":"models/gemini-2.5-pro","supportedGenerationMethods":["generateContent"]}
		]}`))
	}))
	defer server.Close()

	models, err := ListGeminiModels(context.Background(), server.Client(), server.URL, " secret-key ")
	if err != nil {
		t.Fatal(err)
	}

	want := []string{"gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-preview-05-20", "gemini-1.5-pro"}
	if len(models) != len(want) {
		t.Fatalf("expected %d models, got %+v", len(want), models)
	}
	for i, name := range want {
		if models[i].Name != name {
			t.Errorf("position %d: expected %s, got %s", i, name, models[i].Name)
		}
	}
	if models[1].DisplayName != "gemini-2.5-pro" {
		t.Errorf("a missing display name should fall back to the name, got %q", models[1].DisplayName)
	}
	if len(keys) != 2 || keys[0] != "secret-key" {
		t.Errorf("the trimmed key should be sent in the header on every page, got %v", keys)
	}
}

func TestListGeminiModels_RefusedKeyIsAClearError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":{"message":"API key not valid"}}`))
	}))
	defer server.Close()

	_, err := ListGeminiModels(context.Background(), server.Client(), server.URL, "bad")
	if err == nil || err.Error() != "Google did not accept the key (status 400)" {
		t.Fatalf("expected the refused-key error, got %v", err)
	}
}

func TestListGeminiModels_NeedsAKey(t *testing.T) {
	if _, err := ListGeminiModels(context.Background(), nil, "http://unused", "  "); err == nil {
		t.Fatal("expected an error without a key")
	}
}

func TestGeminiVersion(t *testing.T) {
	cases := map[string]float64{"gemini-2.5-flash": 2.5, "gemini-3-pro": 3, "gemini-1.5-pro-002": 1.5, "gemma-3": 0}
	for name, want := range cases {
		if got := geminiVersion(name); got != want {
			t.Errorf("%s: expected %v, got %v", name, want, got)
		}
	}
}
