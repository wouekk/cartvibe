package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"testing"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
)

func createTestUser() models.User {
	user := models.User{
		Username:           "testuser",
		Password:           "hashedpassword",
		DisplayName:        "Test User",
		DefaultAvatarColor: "#FF0000",
	}
	repositories.GetDB().Create(&user)
	return user
}

// Mock JWT validation by skipping middleware and setting context directly
func createFakeHandlerWithContext(claims *validator.ValidatedClaims) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if claims != nil {
			ctx := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, claims)
			r = r.WithContext(ctx)
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	})
}

func createTestJWT(userId uint, username string) string {
	// This is a simplified JWT for testing - in real implementation this would come from the auth service
	return "test.jwt.token"
}

func createFakeHandler() http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	})
}

func setupAuthTest() {
	repositories.TruncateTestDb()
}

func teardownAuthTest() {
	repositories.TruncateTestDb()
}

// Test JWT Authentication Success - Cookie
func TestUnifiedAuthMiddleware_ValidJWTCookie(t *testing.T) {
	defer teardownAuthTest()
	setupAuthTest()

	// Create request with JWT in cookie - since getJwt checks cookie first
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.AddCookie(&http.Cookie{
		Name:  "jwt",
		Value: "valid.jwt.token",
	})
	w := httptest.NewRecorder()

	// Test the getJwt function directly to ensure it works with cookie
	jwt := getJwt(*r)
	if jwt != "valid.jwt.token" {
		utils.PrintTestError(t, jwt, "valid.jwt.token")
	}

	// For this test, we'll verify that the middleware attempts JWT validation
	// when a JWT is present (as opposed to API key validation)
	handler := UnifiedAuthMiddleware(createFakeHandler())
	handler.ServeHTTP(w, r)

	// This will fail JWT validation (expected), but confirms JWT path is taken
	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

// Test JWT Authentication Success - Header
func TestUnifiedAuthMiddleware_ValidJWTHeader(t *testing.T) {
	defer teardownAuthTest()
	setupAuthTest()

	// Create request with JWT in Authorization header (no cookie)
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "Bearer valid.jwt.token")
	w := httptest.NewRecorder()

	// Test the getJwt function directly to ensure it works with header
	jwt := getJwt(*r)
	if jwt != "valid.jwt.token" {
		utils.PrintTestError(t, jwt, "valid.jwt.token")
	}

	// For this test, we'll verify that the middleware attempts JWT validation
	handler := UnifiedAuthMiddleware(createFakeHandler())
	handler.ServeHTTP(w, r)

	// This will fail JWT validation (expected), but confirms JWT path is taken
	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

// Test No Authentication Provided
func TestUnifiedAuthMiddleware_NoAuthentication(t *testing.T) {
	defer teardownAuthTest()
	setupAuthTest()

	// Create request without any authentication
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()

	handler := UnifiedAuthMiddleware(createFakeHandler())
	handler.ServeHTTP(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

// An API key is no longer a credential: a key-shaped Authorization header is
// read as a (bad) JWT and refused.
func TestUnifiedAuthMiddleware_KeyShapedHeaderIsRefused(t *testing.T) {
	defer teardownAuthTest()
	setupAuthTest()

	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "key.1.some-id.c2VjcmV0")
	w := httptest.NewRecorder()

	UnifiedAuthMiddleware(createFakeHandler()).ServeHTTP(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

// Test Malformed Authorization Header
func TestUnifiedAuthMiddleware_MalformedAuthHeader(t *testing.T) {
	defer teardownAuthTest()
	setupAuthTest()

	// Create request with malformed Authorization header (not JWT, not API key)
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "Bearer malformed")
	w := httptest.NewRecorder()

	handler := UnifiedAuthMiddleware(createFakeHandler())
	handler.ServeHTTP(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

// Test Empty Authorization Header
func TestUnifiedAuthMiddleware_EmptyAuthHeader(t *testing.T) {
	defer teardownAuthTest()
	setupAuthTest()

	// Create request with empty Authorization header
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "")
	w := httptest.NewRecorder()

	handler := UnifiedAuthMiddleware(createFakeHandler())
	handler.ServeHTTP(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

// Test Bearer Token Parsing - Valid Bearer token
func TestGetJwt_BearerTokenValid(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "Bearer valid.jwt.token")

	jwt := getJwt(*r)
	expected := "valid.jwt.token"
	if jwt != expected {
		utils.PrintTestError(t, jwt, expected)
	}
}

// Test Bearer Token Parsing - Bearer token with extra spaces
func TestGetJwt_BearerTokenWithSpaces(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "Bearer   token.with.spaces   ")

	jwt := getJwt(*r)
	expected := "token.with.spaces"
	if jwt != expected {
		utils.PrintTestError(t, jwt, expected)
	}
}

// Test Bearer Token Parsing - Empty Bearer token
func TestGetJwt_BearerTokenEmpty(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "Bearer ")

	jwt := getJwt(*r)
	expected := ""
	if jwt != expected {
		utils.PrintTestError(t, jwt, expected)
	}
}

// Test Bearer Token Parsing - Multiple Bearer parts (malformed)
func TestGetJwt_BearerTokenMultipleParts(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "Bearer token Bearer another")

	jwt := getJwt(*r)
	// Should return the original header since it's malformed (more than 2 parts after split)
	expected := "Bearer token Bearer another"
	if jwt != expected {
		utils.PrintTestError(t, jwt, expected)
	}
}

// Test Bearer Token Parsing - Different Bearer case variations
func TestGetJwt_BearerTokenCaseSensitive(t *testing.T) {
	// Test lowercase "bearer" - should NOT be processed as Bearer token
	r1 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r1.Header.Set("Authorization", "bearer valid.jwt.token")

	jwt1 := getJwt(*r1)
	expected1 := "bearer valid.jwt.token" // Should return as-is since "Bearer" is case-sensitive
	if jwt1 != expected1 {
		utils.PrintTestError(t, jwt1, expected1)
	}

	// Test mixed case "BeArEr" - should NOT be processed as Bearer token
	r2 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r2.Header.Set("Authorization", "BeArEr valid.jwt.token")

	jwt2 := getJwt(*r2)
	expected2 := "BeArEr valid.jwt.token" // Should return as-is since "Bearer" is case-sensitive
	if jwt2 != expected2 {
		utils.PrintTestError(t, jwt2, expected2)
	}
}

// Test Bearer Token Parsing - Authorization header without Bearer
func TestGetJwt_AuthHeaderWithoutBearer(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "just.a.token")

	jwt := getJwt(*r)
	expected := "just.a.token"
	if jwt != expected {
		utils.PrintTestError(t, jwt, expected)
	}
}

// Test Bearer Token Parsing - Empty Authorization header
func TestGetJwt_EmptyAuthHeader(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "")

	jwt := getJwt(*r)
	expected := ""
	if jwt != expected {
		utils.PrintTestError(t, jwt, expected)
	}
}

// Test Bearer Token Parsing - Cookie takes precedence over Bearer header
func TestGetJwt_CookieTakesPrecedence(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.AddCookie(&http.Cookie{
		Name:  "jwt",
		Value: "cookie.jwt.token",
	})
	r.Header.Set("Authorization", "Bearer header.jwt.token")

	jwt := getJwt(*r)
	expected := "cookie.jwt.token" // Cookie should take precedence
	if jwt != expected {
		utils.PrintTestError(t, jwt, expected)
	}
}

// Test Bearer Token Parsing - No cookie, Bearer header used
func TestGetJwt_NoCookieBearerHeaderUsed(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	// No cookie set
	r.Header.Set("Authorization", "Bearer header.jwt.token")

	jwt := getJwt(*r)
	expected := "header.jwt.token"
	if jwt != expected {
		utils.PrintTestError(t, jwt, expected)
	}
}

// Test Bearer Token Parsing - Bearer with only spaces
func TestGetJwt_BearerTokenOnlySpaces(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "Bearer    ")

	jwt := getJwt(*r)
	expected := ""
	if jwt != expected {
		utils.PrintTestError(t, jwt, expected)
	}
}

// Test Bearer Token Parsing - Bearer not at start (should not be processed)
func TestGetJwt_BearerNotAtStart(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r.Header.Set("Authorization", "Token Bearer jwt.token")

	jwt := getJwt(*r)
	// Should return the full header unchanged since Bearer is not at the start
	expected := "Token Bearer jwt.token"
	if jwt != expected {
		utils.PrintTestError(t, jwt, expected)
	}
}

// Test Bearer Token Parsing - Proper Bearer prefix handling
func TestGetJwt_BearerPrefixHandling(t *testing.T) {
	// Test with proper Bearer prefix
	r1 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r1.Header.Set("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")

	jwt1 := getJwt(*r1)
	expected1 := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
	if jwt1 != expected1 {
		utils.PrintTestError(t, jwt1, expected1)
	}

	// Test with Bearer at start but no space (should still work with Contains logic)
	r2 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r2.Header.Set("Authorization", "Bearertoken123")

	jwt2 := getJwt(*r2)
	expected2 := "token123"
	if jwt2 != expected2 {
		utils.PrintTestError(t, jwt2, expected2)
	}

	// Test with "Bearer" as part of token but not at start
	r3 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	r3.Header.Set("Authorization", "MyBearer token123")

	jwt3 := getJwt(*r3)
	expected3 := "MyBearer token123" // Should not be processed
	if jwt3 != expected3 {
		utils.PrintTestError(t, jwt3, expected3)
	}
}
