package oauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/utils"
)

func codeForm(code string, clientId string, redirectUri string, verifier string) url.Values {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("client_id", clientId)
	form.Set("redirect_uri", redirectUri)
	form.Set("code_verifier", verifier)
	return form
}

func refreshForm(refreshToken string) url.Values {
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	return form
}

func expectOAuthError(t *testing.T, recorder *httptest.ResponseRecorder, status int, oauthError string) {
	t.Helper()
	if recorder.Code != status {
		t.Fatalf("expected %d, got %d (%s)", status, recorder.Code, recorder.Body.String())
	}
	if got := decodeJson(t, recorder.Body.Bytes())["error"]; got != oauthError {
		t.Errorf("error = %v, want %s", got, oauthError)
	}
}

func codeIsUsed(t *testing.T, code string) bool {
	t.Helper()
	stored, err := getAuthorizationCode(code)
	if err != nil {
		t.Fatalf("load code: %v", err)
	}
	return stored.Used
}

func TestTokenRejectsAnExpiredCode(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createTestUserWithPassword(t, "ivan", "password")
	client, _ := createClient("Claude", []string{testRedirectUri})
	verifier := "expired-code-verifier-value-1234567890"
	code, _ := createAuthorizationCode(client.ClientId, user.ID, testRedirectUri, challengeFor(verifier), readScope, "")
	repositories.GetDB().Model(&models.OAuthAuthorizationCode{}).Where("code = ?", code).
		Update("expires_at", time.Now().Add(-time.Minute))

	expectOAuthError(t, postToken(t, codeForm(code, client.ClientId, testRedirectUri, verifier)), http.StatusBadRequest, "invalid_grant")
	if codeIsUsed(t, code) {
		t.Errorf("an expired code is refused, not marked used")
	}
}

func TestTokenRedirectMismatchDoesNotBurnTheCode(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createTestUserWithPassword(t, "judy", "password")
	other := "https://claude.ai/api/mcp/other_callback"
	client, _ := createClient("Claude", []string{testRedirectUri, other})
	verifier := "redirect-mismatch-verifier-1234567890"
	code, _ := createAuthorizationCode(client.ClientId, user.ID, testRedirectUri, challengeFor(verifier), readScope, "")

	// Even a redirect the client registered must be the one the code was issued for.
	expectOAuthError(t, postToken(t, codeForm(code, client.ClientId, other, verifier)), http.StatusBadRequest, "invalid_grant")
	if codeIsUsed(t, code) {
		t.Fatalf("a mismatched redirect_uri must not consume the code")
	}

	if recorder := postToken(t, codeForm(code, client.ClientId, testRedirectUri, verifier)); recorder.Code != http.StatusOK {
		t.Fatalf("the right redirect still redeems the code: %d (%s)", recorder.Code, recorder.Body.String())
	}
}

func TestTokenWrongVerifierDoesNotBurnTheCode(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createTestUserWithPassword(t, "kate", "password")
	client, _ := createClient("Claude", []string{testRedirectUri})
	verifier := "pkce-verifier-that-is-correct-12345"
	code, _ := createAuthorizationCode(client.ClientId, user.ID, testRedirectUri, challengeFor(verifier), readScope, "")

	expectOAuthError(t, postToken(t, codeForm(code, client.ClientId, testRedirectUri, "guessed")), http.StatusBadRequest, "invalid_grant")
	if codeIsUsed(t, code) {
		t.Fatalf("a failed PKCE check must not consume the code")
	}
	if recorder := postToken(t, codeForm(code, client.ClientId, testRedirectUri, verifier)); recorder.Code != http.StatusOK {
		t.Fatalf("the real verifier still redeems the code: %d", recorder.Code)
	}
}

func TestTokenRejectsMalformedRequests(t *testing.T) {
	defer repositories.TruncateTestDb()

	missingVerifier := codeForm("some-code", "client", testRedirectUri, "")
	expectOAuthError(t, postToken(t, missingVerifier), http.StatusBadRequest, "invalid_request")

	missingCode := codeForm("", "client", testRedirectUri, "verifier")
	expectOAuthError(t, postToken(t, missingCode), http.StatusBadRequest, "invalid_request")

	unknownCode := codeForm("never-issued", "client", testRedirectUri, "verifier")
	expectOAuthError(t, postToken(t, unknownCode), http.StatusBadRequest, "invalid_grant")

	password := url.Values{}
	password.Set("grant_type", "password")
	password.Set("username", "x")
	expectOAuthError(t, postToken(t, password), http.StatusBadRequest, "unsupported_grant_type")

	expectOAuthError(t, postToken(t, refreshForm("")), http.StatusBadRequest, "invalid_request")
	expectOAuthError(t, postToken(t, refreshForm("not-a-jwt")), http.StatusBadRequest, "invalid_grant")
}

func TestRefreshRotationAcceptsOnlyTheNewestToken(t *testing.T) {
	defer repositories.TruncateTestDb()

	setPublicUrl(t)
	user := createTestUserWithPassword(t, "leo", "password")
	_, first, _, err := services.GenerateMcpJWT(user.ID, mcpResourceUrl())
	if err != nil {
		t.Fatalf("mint: %v", err)
	}

	recorder := postToken(t, refreshForm(first))
	if recorder.Code != http.StatusOK {
		t.Fatalf("first refresh: %d (%s)", recorder.Code, recorder.Body.String())
	}
	second, _ := decodeJson(t, recorder.Body.Bytes())["refresh_token"].(string)
	if second == "" || second == first {
		t.Fatalf("a refresh must hand out a new refresh token")
	}

	expectOAuthError(t, postToken(t, refreshForm(first)), http.StatusBadRequest, "invalid_grant")

	if recorder := postToken(t, refreshForm(second)); recorder.Code != http.StatusOK {
		t.Fatalf("the rotated token must work once: %d (%s)", recorder.Code, recorder.Body.String())
	}
	expectOAuthError(t, postToken(t, refreshForm(second)), http.StatusBadRequest, "invalid_grant")
}

func TestRefreshRejectsARestSessionToken(t *testing.T) {
	defer repositories.TruncateTestDb()

	setPublicUrl(t)
	user := createTestUserWithPassword(t, "mia", "password")
	_, restRefresh, _, err := services.GenerateJWT(user.ID)
	if err != nil {
		t.Fatalf("mint: %v", err)
	}

	expectOAuthError(t, postToken(t, refreshForm(restRefresh)), http.StatusBadRequest, "invalid_grant")

	var stored models.RefreshToken
	if err := repositories.GetDB().Where("token = ?", utils.Sha256Hash([]byte(restRefresh))).First(&stored).Error; err != nil {
		t.Fatalf("the REST refresh token must be stored: %v", err)
	}
	if stored.IsUsed {
		t.Errorf("a refused cross-audience attempt must not burn the person's web session")
	}
}

func TestRefreshFailsAfterThePublicUrlChanges(t *testing.T) {
	defer repositories.TruncateTestDb()

	setPublicUrl(t)
	user := createTestUserWithPassword(t, "nina", "password")
	_, refresh, _, err := services.GenerateMcpJWT(user.ID, mcpResourceUrl())
	if err != nil {
		t.Fatalf("mint: %v", err)
	}

	repositories.GetDB().Model(&models.SystemSettings{}).Where("1 = 1").Update("mcp_public_url", "https://moved.example.com")

	expectOAuthError(t, postToken(t, refreshForm(refresh)), http.StatusBadRequest, "invalid_grant")
}

func TestIssuedAccessTokenIsBoundToTheMcpAudience(t *testing.T) {
	defer repositories.TruncateTestDb()

	setPublicUrl(t)
	createTestUserWithPassword(t, "olga", "password")
	client, _ := createClient("Claude", []string{testRedirectUri})
	verifier := "audience-check-verifier-1234567890"

	login := postAuthorize(t, client, testRedirectUri, "olga", "password", challengeFor(verifier))
	if login.Code != http.StatusFound {
		t.Fatalf("login: %d", login.Code)
	}
	location, _ := url.Parse(login.Header().Get("Location"))
	code := location.Query().Get("code")

	recorder := postToken(t, codeForm(code, client.ClientId, testRedirectUri, verifier))
	if recorder.Code != http.StatusOK {
		t.Fatalf("token: %d (%s)", recorder.Code, recorder.Body.String())
	}
	body := decodeJson(t, recorder.Body.Bytes())
	access, _ := body["access_token"].(string)
	if body["scope"] != readScope || body["expires_in"] != float64(accessTokenExpiresIn) {
		t.Errorf("token response: %v", body)
	}

	mcpValidator, _ := services.InitMcpTokenValidator(mcpResourceUrl())
	if _, err := mcpValidator.ValidateToken(context.Background(), access); err != nil {
		t.Errorf("the MCP endpoint must accept the token: %v", err)
	}
	restValidator, _ := services.InitTokenValidator()
	if _, err := restValidator.ValidateToken(context.Background(), access); err == nil {
		t.Errorf("the REST API must refuse an MCP token")
	}
}

func TestAuthorizeFormNeverRedirectsToAnUnregisteredUri(t *testing.T) {
	defer repositories.TruncateTestDb()

	client, _ := createClient("Claude", []string{testRedirectUri})
	for _, redirect := range []string{testRedirectUri + "/evil", testRedirectUri + "?x=1", strings.ToUpper(testRedirectUri), ""} {
		query := url.Values{}
		query.Set("client_id", client.ClientId)
		query.Set("redirect_uri", redirect)
		query.Set("response_type", "code")
		query.Set("code_challenge", challengeFor("v"))
		query.Set("code_challenge_method", "S256")
		recorder := httptest.NewRecorder()
		AuthorizeForm(recorder, httptest.NewRequest(http.MethodGet, "/oauth/authorize?"+query.Encode(), nil))
		if recorder.Code != http.StatusBadRequest || recorder.Header().Get("Location") != "" {
			t.Errorf("%q: expected an error page, got %d to %q", redirect, recorder.Code, recorder.Header().Get("Location"))
		}
	}

	query := url.Values{}
	query.Set("client_id", "unknown-client")
	query.Set("redirect_uri", testRedirectUri)
	recorder := httptest.NewRecorder()
	AuthorizeForm(recorder, httptest.NewRequest(http.MethodGet, "/oauth/authorize?"+query.Encode(), nil))
	if recorder.Code != http.StatusBadRequest || recorder.Header().Get("Location") != "" {
		t.Errorf("unknown client: %d to %q", recorder.Code, recorder.Header().Get("Location"))
	}
}

func TestAuthorizeFormRedirectsProtocolErrorsWithState(t *testing.T) {
	defer repositories.TruncateTestDb()

	client, _ := createClient("Claude", []string{testRedirectUri})
	cases := []struct {
		name  string
		edit  func(url.Values)
		error string
	}{
		{"token flow", func(q url.Values) { q.Set("response_type", "token") }, "unsupported_response_type"},
		{"no challenge", func(q url.Values) { q.Del("code_challenge") }, "invalid_request"},
	}
	for _, tc := range cases {
		query := url.Values{}
		query.Set("client_id", client.ClientId)
		query.Set("redirect_uri", testRedirectUri)
		query.Set("response_type", "code")
		query.Set("state", "keep-me")
		query.Set("code_challenge", challengeFor("v"))
		query.Set("code_challenge_method", "S256")
		tc.edit(query)

		recorder := httptest.NewRecorder()
		AuthorizeForm(recorder, httptest.NewRequest(http.MethodGet, "/oauth/authorize?"+query.Encode(), nil))
		if recorder.Code != http.StatusFound {
			t.Fatalf("%s: expected 302, got %d", tc.name, recorder.Code)
		}
		location, _ := url.Parse(recorder.Header().Get("Location"))
		if !strings.HasPrefix(location.String(), testRedirectUri) || location.Query().Get("error") != tc.error ||
			location.Query().Get("state") != "keep-me" || location.Query().Get("code") != "" {
			t.Errorf("%s: redirect %s", tc.name, location)
		}
	}
}

func TestRegisterRejectsMalformedBodyAndAnswersAPublicClient(t *testing.T) {
	defer repositories.TruncateTestDb()

	recorder := httptest.NewRecorder()
	Register(recorder, httptest.NewRequest(http.MethodPost, "/oauth/register", strings.NewReader(`{"redirect_uris":`)))
	expectOAuthError(t, recorder, http.StatusBadRequest, "invalid_client_metadata")

	recorder = httptest.NewRecorder()
	Register(recorder, httptest.NewRequest(http.MethodPost, "/oauth/register", strings.NewReader(`{"redirect_uris":"https://a.example/cb"}`)))
	expectOAuthError(t, recorder, http.StatusBadRequest, "invalid_client_metadata")

	recorder = httptest.NewRecorder()
	Register(recorder, httptest.NewRequest(http.MethodPost, "/oauth/register", strings.NewReader(`{"redirect_uris":[]}`)))
	expectOAuthError(t, recorder, http.StatusBadRequest, "invalid_redirect_uri")

	var clients int64
	repositories.GetDB().Model(&models.OAuthClient{}).Count(&clients)
	if clients != 0 {
		t.Fatalf("a refused registration stores nothing, found %d clients", clients)
	}

	ids := map[string]bool{}
	for range 2 {
		recorder = httptest.NewRecorder()
		Register(recorder, httptest.NewRequest(http.MethodPost, "/oauth/register",
			strings.NewReader(`{"client_name":"Claude","client_secret":"ignored","redirect_uris":["http://localhost:6274/cb"]}`)))
		if recorder.Code != http.StatusCreated {
			t.Fatalf("register: %d (%s)", recorder.Code, recorder.Body.String())
		}
		body := decodeJson(t, recorder.Body.Bytes())
		if body["token_endpoint_auth_method"] != "none" || body["client_secret"] != nil {
			t.Errorf("a registered client is public: %v", body)
		}
		ids[body["client_id"].(string)] = true
	}
	if len(ids) != 2 {
		t.Errorf("each registration gets its own client_id")
	}
}
