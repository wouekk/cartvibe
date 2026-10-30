package oidc

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
)

// startLink drives GET /oidc/link/{name} as the given user.
func startLink(t *testing.T, providerName string, userId uint) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(http.MethodGet, "/api/oidc/link/"+providerName, nil)
	request = withUrlParam(request, "name", providerName)
	request = request.WithContext(context.WithValue(
		request.Context(),
		jwtmiddleware.ContextKey{},
		&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: userId}},
	))

	recorder := httptest.NewRecorder()
	LinkStart(recorder, request)

	return recorder
}

func countAuthSessions(t *testing.T) int64 {
	t.Helper()

	var count int64
	if err := repositories.GetDB().Model(&models.OidcAuthSession{}).Count(&count).Error; err != nil {
		t.Fatalf("failed to count auth sessions: %v", err)
	}

	return count
}

// TestLinkStartRequiresAccountUpdatePermission is the gate itself.
//
// Connecting a provider ADDS a way to sign into an account, so it must be at
// least as privileged as disconnecting one -- and DeleteOidcConnection already
// requires app.account.update. Without this check an administrator could build a
// role that cannot remove a sign-in method but can still add one.
func TestLinkStartRequiresAccountUpdatePermission(t *testing.T) {
	defer teardownOidcTest()
	_, provider := setupOidcTest(t, oidcTestOptions{})

	// Holds the read half but not the update half, which is exactly the role an
	// administrator would build to make an account's bindings look-but-don't-touch.
	user := createTestUserWithPermissions(t, "restricted", permissions.AppAccountRead)

	recorder := startLink(t, provider.Name, user.ID)

	if recorder.Code != http.StatusFound {
		t.Fatalf("expected a redirect, got %d", recorder.Code)
	}

	if code := oidcErrorCode(t, recorder); code != errForbidden {
		t.Errorf("expected the %q error code, got %q", errForbidden, code)
	}

	// Nothing may be started: a denied caller must not even reach the identity
	// provider, and must not leave a redeemable session row behind.
	if count := countAuthSessions(t); count != 0 {
		t.Errorf("expected no auth session to be created for a denied caller, got %d", count)
	}
}

// TestLinkStartFailureLandsOnTheProfileNotTheLoginPage pins the redirect target.
// A link caller is already signed in, so bouncing them to a login form reads as
// "you have been signed out" rather than "that provider could not be connected".
func TestLinkStartFailureLandsOnTheProfileNotTheLoginPage(t *testing.T) {
	defer teardownOidcTest()
	_, provider := setupOidcTest(t, oidcTestOptions{})

	user := createTestUserWithPermissions(t, "restricted")

	recorder := startLink(t, provider.Name, user.ID)

	location := recorder.Header().Get("Location")
	if !strings.HasPrefix(location, desktopProfilePath) {
		t.Errorf("expected a redirect to %q, got %q", desktopProfilePath, location)
	}

	if strings.Contains(location, desktopLoginPath) {
		t.Errorf("a signed-in caller must not be sent to the login page, got %q", location)
	}
}

// TestLinkStartProceedsWithAccountUpdatePermission is the other half: the gate
// must not break the flow it guards.
func TestLinkStartProceedsWithAccountUpdatePermission(t *testing.T) {
	defer teardownOidcTest()
	idp, provider := setupOidcTest(t, oidcTestOptions{})

	user := createTestUserWithPermissions(t, "allowed", permissions.AppAccountUpdate)

	recorder := startLink(t, provider.Name, user.ID)

	if recorder.Code != http.StatusFound {
		t.Fatalf("expected a redirect, got %d (%s)", recorder.Code, recorder.Body.String())
	}

	location, err := url.Parse(recorder.Header().Get("Location"))
	if err != nil {
		t.Fatalf("failed to parse the redirect: %v", err)
	}

	if !strings.HasPrefix(location.String(), idp.issuer()) {
		t.Fatalf("expected a redirect to the identity provider at %q, got %q", idp.issuer(), location)
	}

	var session models.OidcAuthSession
	err = repositories.GetDB().
		Model(&models.OidcAuthSession{}).
		Where("state_hash = ?", hashSecret(location.Query().Get("state"))).
		First(&session).Error
	if err != nil {
		t.Fatalf("expected an auth session for the minted state: %v", err)
	}

	if !session.IsLink() {
		t.Fatal("expected a link session, got a plain login session")
	}

	if *session.LinkUserId != user.ID {
		t.Errorf("expected the session to carry user %d, got %d", user.ID, *session.LinkUserId)
	}
}

// TestLinkCallbackFailuresLandOnTheProfileNotTheLoginPage is the rule
// redirectLinkError's own doc comment states, applied to every callback check
// rather than only to the last one.
//
// A link's caller is already signed in, so the login screen reads as "you have
// been signed out" rather than "that provider could not be connected". Only
// finishLink routed that way at first, which left every check between the
// provider match and the nonce compare bouncing a signed-in user to a login
// form. The two cases below are the ones a real user actually hits: a browser
// that dropped the binding cookie, and a state redeemed at a different
// provider's callback.
func TestLinkCallbackFailuresLandOnTheProfileNotTheLoginPage(t *testing.T) {
	// Two DIFFERENT call sites -- the provider match (check 3) and the browser
	// binding (check 4) -- so this covers the helper being applied across the
	// branch set rather than at one line.
	for _, testCase := range []struct {
		name          string
		sendCookies   bool
		otherCallback bool
		wants         string
	}{
		{name: "missing binding cookie", sendCookies: false, wants: errInvalidState},
		{name: "redeemed at another provider", sendCookies: true, otherCallback: true, wants: errInvalidState},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			defer teardownOidcTest()
			_, provider := setupOidcTest(t, oidcTestOptions{})

			user := createTestUserWithPermissions(t, "linker", permissions.AppAccountUpdate)

			startRecorder := startLink(t, provider.Name, user.ID)
			if startRecorder.Code != http.StatusFound {
				t.Fatalf("expected the link to start, got %d (%s)", startRecorder.Code, startRecorder.Body.String())
			}

			authUrl, err := url.Parse(startRecorder.Header().Get("Location"))
			if err != nil {
				t.Fatalf("failed to parse the authorization URL: %v", err)
			}

			var cookies []*http.Cookie
			if testCase.sendCookies {
				cookies = startRecorder.Result().Cookies()
			}

			callbackProvider := provider.Name
			if testCase.otherCallback {
				callbackProvider = createTestProvider(t, provider.IssuerUrl, providerOptions{
					name:     "other",
					clientId: "other-client",
				}).Name
			}

			recorder := runCallback(t, callbackProvider, url.Values{
				"state": {authUrl.Query().Get("state")},
				"code":  {"any-code"},
			}, cookies)

			location := recorder.Header().Get("Location")

			if strings.HasPrefix(location, desktopLoginPath) {
				t.Fatalf("a failed LINK was sent to the login screen: %s", location)
			}

			if !strings.HasPrefix(location, desktopProfilePath) {
				t.Errorf("expected a return to %s, got %s", desktopProfilePath, location)
			}

			if code := oidcErrorCode(t, recorder); code != testCase.wants {
				t.Errorf("expected the %q error code, got %q", testCase.wants, code)
			}
		})
	}
}

// TestLoginCallbackFailuresStillLandOnTheLoginPage is the contrast, and the
// reason failCallback branches on the session rather than just always using
// redirectLinkError. A LOGIN that fails has no session to go back to, so the
// login screen is exactly right -- and both flows are "desktop", so the client
// type alone cannot tell them apart.
func TestLoginCallbackFailuresStillLandOnTheLoginPage(t *testing.T) {
	defer teardownOidcTest()
	_, provider := setupOidcTest(t, oidcTestOptions{})

	state, _ := loginAndExtract(t, provider, "")

	recorder := runCallback(t, provider.Name, url.Values{
		"state": {state},
		"code":  {"any-code"},
	}, nil)

	location := recorder.Header().Get("Location")
	if !strings.HasPrefix(location, desktopLoginPath) {
		t.Errorf("expected a failed login to return to %s, got %s", desktopLoginPath, location)
	}
}

