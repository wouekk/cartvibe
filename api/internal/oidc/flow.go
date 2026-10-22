package oidc

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"time"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-chi/chi/v5"
	"golang.org/x/oauth2"
	"gorm.io/gorm"
)

const (
	// bindingCookieName holds the user-agent-binding secret. Set on every leg.
	bindingCookieName = "oidc_session"

	// bindingCookiePath scopes the cookie to the OIDC routes: nothing else needs
	// it, and it should not ride along on every API call.
	bindingCookiePath = "/api/oidc"

	// desktopCallbackPath is where the browser lands after a successful login. It
	// is a fixed, relative path: no redirect target is ever taken from the request,
	// which is what keeps this flow free of an open-redirect hole.
	desktopCallbackPath = "/auth/callback"

	// desktopLoginPath is where a failed login lands.
	desktopLoginPath = "/auth/login"

	// desktopProfilePath is where a signed-in flow -- a link or a delete
	// confirmation -- returns to.
	desktopProfilePath = "/settings/user-profile/view"

	exchangeTimeout = 15 * time.Second

	// authTimeSkew is how far our clock and the identity provider's may disagree
	// when the delete confirmation compares auth_time against the moment the flow
	// began.
	authTimeSkew = 60 * time.Second
)

// Error codes handed back to a client. A small fixed vocabulary -- an upstream
// identity provider's own error text is never echoed through.
const (
	errUnknownProvider = "unknown_provider"
	errInvalidRequest  = "invalid_request"
	errInvalidState    = "invalid_state"
	errNonceMismatch   = "nonce_mismatch"
	errNoIdToken       = "no_id_token"
	errProviderError   = "provider_error"
	errNoAccount       = "no_account"
	errAccountExists   = "account_exists"
	errAlreadyLinked   = "already_linked"
	errForbidden       = "forbidden"
	errServerError     = "server_error"

	// The delete confirmation's own refusals.
	errNotLinked        = "not_linked"
	errIdentityMismatch = "identity_mismatch"
	errStaleLogin       = "stale_login"
)

// Login starts an OIDC login. Unauthenticated.
func Login(w http.ResponseWriter, r *http.Request) {
	startFlow(w, r, nil, models.OidcPurposeLogin)
}

// LinkStart starts a "connect account" flow for the authenticated caller. It is
// the same flow as Login, differing only in that the resulting session carries
// the caller's user id -- so the callback links instead of guessing.
//
// Gated on app.account.update, resolved from the database and never from the
// JWT. Connecting a provider ADDS a way to sign into this account, so it is at
// least as privileged as disconnecting one -- and DeleteOidcConnection already
// requires exactly this permission. Without the check an administrator could
// build a role that cannot remove a sign-in method but can still add one, which
// is not a coherent thing to be able to configure.
//
// The check lives in the handler body rather than on a structs.Handler because
// this route answers with a redirect, not JSON: HandleRequest's 403 would drop a
// raw error object into a browser the user navigated here. Same shape as
// GetPagedApiKeys' app.api-keys.read-any check.
//
// An API KEY MAY NOT START A LINK, whatever its scope. This is the one gate here
// that is about the credential rather than the user, and it closes a privilege
// escalation: the route is a GET, so middleware.classifyRequest reads it as a
// read and a plain "r" key satisfies the scope gate; Legacy User holds
// app.account.update, so the permission check below passes too. The holder then
// opens the returned launch URL (or follows the 302) in their own browser,
// authenticates at the identity provider as THEMSELVES, and the callback writes
// that identity against the key owner's account. "Log in with X" afterwards is a
// full interactive session -- one that survives revoking the key, and that shows
// up only as an extra Connected Accounts row.
//
// There is no existing equivalent to fall back on, which is why this is worth a
// gate of its own rather than accepting it as inherent to holding a key: a
// non-admin's key cannot reach ResetPassword (app.users.update, which Legacy User
// lacks) and UpdateProfileCommand carries no password. A key is a scoped,
// revocable credential and must not be able to mint an unscoped, unrevocable one.
func LinkStart(w http.ResponseWriter, r *http.Request) {
	userId, ok := authorizeSignedInStart(w, r, models.OidcPurposeLink, permissions.AppAccountUpdate)
	if !ok {
		return
	}

	startFlow(w, r, &userId, models.OidcPurposeLink)
}

// DeleteConfirmationStart starts the flow that lets an account with no password
// of its own confirm its deletion: it signs in at one of its linked providers
// again, and the callback hands back a single-use code that
// POST /user/deleteAccount accepts in place of the password.
//
// Gated on app.account.delete -- the permission the delete itself needs -- and,
// like LinkStart, on an interactive session: a key must not be able to begin
// destroying the account that issued it. Two further checks narrow it to exactly
// the accounts it exists for:
//
//   - The account must be passwordless. One with a password confirms with that
//     password, so a provider is never a second way around it.
//   - The account must hold an identity at THIS provider. The callback will only
//     accept that identity signing in, so starting anywhere else is a flow that
//     cannot succeed.
func DeleteConfirmationStart(w http.ResponseWriter, r *http.Request) {
	purpose := models.OidcPurposeDeleteAccount

	userId, ok := authorizeSignedInStart(w, r, purpose, permissions.AppAccountDelete)
	if !ok {
		return
	}

	identityRepository := repositories.NewOidcIdentityRepository(nil)

	passwordless, err := identityRepository.IsAccountPasswordless(userId)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to resolve whether an account is passwordless: "+err.Error())
		failBrowserFlowStart(w, r, purpose, errServerError)
		return
	}

	if !passwordless {
		failBrowserFlowStart(w, r, purpose, errForbidden)
		return
	}

	providerRow, err := repositories.NewOidcProviderRepository(nil).GetEnabledOidcProviderByName(chi.URLParam(r, "name"))
	if err != nil {
		failBrowserFlowStart(w, r, purpose, errUnknownProvider)
		return
	}

	_, err = identityRepository.GetIdentityForUser(providerRow.ID, userId)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		failBrowserFlowStart(w, r, purpose, errNotLinked)
		return
	}

	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to load the identity for a delete confirmation: "+err.Error())
		failBrowserFlowStart(w, r, purpose, errServerError)
		return
	}

	startFlow(w, r, &userId, purpose)
}

// authorizeSignedInStart runs the checks every flow started by a signed-in
// account shares, answering the failure itself. It reports the caller's user id
// and whether to proceed.
func authorizeSignedInStart(
	w http.ResponseWriter,
	r *http.Request,
	purpose string,
	permission string,
) (uint, bool) {
	claims := structs.GetClaims(r)

	// Phrased as "must be an interactive session", never "must not be an API key".
	// The zero AuthSource is neither, so anything that reaches this handler without
	// having gone through UnifiedAuthMiddleware is denied rather than waved past.
	// Checked before the permission read because it is a property of the request,
	// not of the user, and it costs no query.
	if claims.AuthSource != structs.AuthSourceJwt {
		logging.LogStd(
			logging.LOG_LEVEL_ERROR,
			"Refused a signed-in OIDC flow start that was not authenticated by an interactive session",
		)
		failBrowserFlowStart(w, r, purpose, errForbidden)
		return 0, false
	}

	allowed, err := services.NewPermissionService(nil).HasAppPermissions(claims.UserId, permission)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to resolve permissions for a signed-in OIDC flow: "+err.Error())
		failBrowserFlowStart(w, r, purpose, errServerError)
		return 0, false
	}

	if !allowed {
		failBrowserFlowStart(w, r, purpose, errForbidden)
		return 0, false
	}

	return claims.UserId, true
}

// startFlow creates the auth session and sends the user agent to the identity
// provider. Every caller is a BROWSER navigation, which is what lets it bind the
// session to the agent unconditionally. linkUserId is set exactly when the purpose
// is a signed-in one.
func startFlow(w http.ResponseWriter, r *http.Request, linkUserId *uint, purpose string) {
	name := chi.URLParam(r, "name")

	providerRow, err := repositories.NewOidcProviderRepository(nil).GetEnabledOidcProviderByName(name)
	if err != nil {
		failBrowserFlowStart(w, r, purpose, errUnknownProvider)
		return
	}

	discovered, err := GetProvider(providerRow)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "OIDC discovery failed for provider "+providerRow.Name+": "+err.Error())
		failBrowserFlowStart(w, r, purpose, errProviderError)
		return
	}

	config, err := buildOauthConfig(providerRow, discovered, services.BuildOidcRedirectUri(providerRow.Name))
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to build OIDC config for provider "+providerRow.Name+": "+err.Error())
		failBrowserFlowStart(w, r, purpose, errServerError)
		return
	}

	verifier := oauth2.GenerateVerifier()

	created, err := createAuthSession(newAuthSessionParams{
		ProviderId:   providerRow.ID,
		LinkUserId:   linkUserId,
		Purpose:      purpose,
		CodeVerifier: verifier,
	})
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to create OIDC auth session: "+err.Error())
		failBrowserFlowStart(w, r, purpose, errServerError)
		return
	}

	// Unconditional. The authorization URL about to be built
	// carries the state, and identity providers leak it -- their login pages load
	// third-party resources and hand the whole URL over as a Referer. This cookie
	// is what makes a leaked state worthless: the attacker cannot produce it, so
	// their callback is refused.
	http.SetCookie(w, buildBindingCookie(created.Binding))

	options := []oauth2.AuthCodeOption{
		oidc.Nonce(created.Nonce),
		oauth2.S256ChallengeOption(verifier),
	}

	// A delete confirmation asks for a FRESH sign-in. max_age=0 is the standard
	// way to ask, and the one whose result can be checked: a provider that honours
	// it must return auth_time, which finishDeleteConfirmation verifies. A provider
	// that does not support it ignores an unrecognized parameter, as OAuth
	// requires. prompt=login is deliberately NOT sent: Google lists only none,
	// consent and select_account, so it could fail the flow outright there.
	if purpose == models.OidcPurposeDeleteAccount {
		options = append(options, oauth2.SetAuthURLParam("max_age", "0"))
	}

	authUrl := config.AuthCodeURL(created.State, options...)

	http.Redirect(w, r, authUrl, http.StatusFound)
}

// Callback is where the identity provider returns the user. Every check below is
// load-bearing; they run in this order and fail closed.
func Callback(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")

	// What the flow is for, for the failures below that happen BEFORE a session is
	// in hand. The identity provider appends only code/state/error to the fixed
	// redirect URI, so the state is the only thing that can answer it. Anything
	// unknown reads as a login.
	//
	// It matters most for the branch that is not an attack at all: a user who
	// declines consent. Answered as a login, a signed-in user backing out of a link
	// or a delete confirmation lands on the login screen, which reads as "you have
	// been signed out".
	pending := pendingSession(state)

	providerRow, err := repositories.NewOidcProviderRepository(nil).GetEnabledOidcProviderByName(name)
	if err != nil {
		failCallback(w, r, pending, errUnknownProvider)
		return
	}

	// 1. The identity provider itself refused. Nothing is consumed; the pending
	// session simply expires. Never echo the upstream text.
	if len(r.URL.Query().Get("error")) > 0 {
		clearBindingCookie(w, r)
		failCallback(w, r, pending, errProviderError)
		return
	}

	if len(state) == 0 || len(code) == 0 {
		clearBindingCookie(w, r)
		failCallback(w, r, pending, errInvalidRequest)
		return
	}

	// 2. Claim the session ATOMICALLY, before any network call. A replayed state
	// therefore cannot even reach the identity provider, let alone mint a second
	// session. Unknown, expired and already-used states are indistinguishable.
	session, claimed, err := consumeAuthSession(state)
	clearBindingCookie(w, r)

	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to consume OIDC auth session: "+err.Error())
		redirectWithError(w, r, errServerError)
		return
	}

	// Unlike the branches above, this one cannot do better than the default: a
	// session that was already spent, expired or never existed is precisely what
	// pendingSession can report nothing about.
	if !claimed {
		redirectWithError(w, r, errInvalidState)
		return
	}

	// 3. The state must belong to THIS provider. Otherwise a state minted for a
	// permissive provider could be redeemed at a stricter one's callback.
	if session.OidcProviderId != providerRow.ID {
		failCallback(w, r, session, errInvalidState)
		return
	}

	// 4. User-agent binding -- the login-CSRF defense, and the single most
	// load-bearing check here. Without it an attacker who obtains the state (the
	// identity provider's own login page leaks the authorization URL by Referer)
	// can complete the flow as THEMSELVES and have the result land on the victim:
	// signed into the attacker's account on a login, or the attacker's identity
	// grafted onto the victim's account on a link.
	//
	// Unconditional by design. No session is created unbound, so an empty hash is
	// a bug rather than a mode, and it must fail closed here rather than wave the
	// callback through.
	if !bindingMatches(r, session.BindingHash) {
		failCallback(w, r, session, errInvalidState)
		return
	}

	verifier, err := decryptVerifier(session)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to decrypt OIDC code verifier: "+err.Error())
		failCallback(w, r, session, errServerError)
		return
	}

	discovered, err := GetProvider(providerRow)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "OIDC discovery failed on callback: "+err.Error())
		failCallback(w, r, session, errProviderError)
		return
	}

	config, err := buildOauthConfig(providerRow, discovered, services.BuildOidcRedirectUri(providerRow.Name))
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to build OIDC config on callback: "+err.Error())
		failCallback(w, r, session, errServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), exchangeTimeout)
	defer cancel()
	ctx = oidc.ClientContext(ctx, &http.Client{Timeout: exchangeTimeout})

	// 5. Exchange the code, proving possession of our PKCE verifier.
	token, err := config.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "OIDC code exchange failed: "+err.Error())
		failCallback(w, r, session, errProviderError)
		return
	}

	// 6. No ID token means this was an OAuth response, not an OIDC one -- there is
	// no verified identity to act on. Hard fail rather than falling back to
	// userinfo, which is not signed.
	rawIdToken, ok := token.Extra("id_token").(string)
	if !ok || len(rawIdToken) == 0 {
		failCallback(w, r, session, errNoIdToken)
		return
	}

	// 7. Verify signature (via JWKS), issuer, audience and expiry.
	idToken, err := discovered.Verifier(&oidc.Config{ClientID: providerRow.ClientId}).Verify(ctx, rawIdToken)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "OIDC ID token verification failed: "+err.Error())
		failCallback(w, r, session, errProviderError)
		return
	}

	// 8. Verify the nonce OURSELVES. go-oidc documents that Verify does NOT do
	// nonce validation -- "that is the caller's responsibility" -- and skipping it
	// re-opens ID token replay. The empty check matters independently: an empty
	// nonce hashes to a fixed value, and must never be allowed to match.
	if len(idToken.Nonce) == 0 || !utils.SecureCompare(hashSecret(idToken.Nonce), session.NonceHash) {
		failCallback(w, r, session, errNonceMismatch)
		return
	}

	claims, err := extractClaims(ctx, discovered, config, token, idToken)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to read OIDC claims: "+err.Error())
		failCallback(w, r, session, errProviderError)
		return
	}

	if len(claims.Subject) == 0 {
		failCallback(w, r, session, errProviderError)
		return
	}

	switch session.FlowPurpose() {
	case models.OidcPurposeLink:
		finishLink(w, r, providerRow, claims, session)
	case models.OidcPurposeDeleteAccount:
		finishDeleteConfirmation(w, r, providerRow, claims, session)
	default:
		finishLogin(w, r, providerRow, claims, session)
	}
}

// extractClaims decodes the ID token's claims, falling back to the userinfo
// endpoint only to fill in an email the ID token omitted. Identity itself always
// comes from the signed ID token.
func extractClaims(
	ctx context.Context,
	discovered *oidc.Provider,
	config *oauth2.Config,
	token *oauth2.Token,
	idToken *oidc.IDToken,
) (idTokenClaims, error) {
	var raw json.RawMessage
	if err := idToken.Claims(&raw); err != nil {
		return idTokenClaims{}, err
	}

	claims, err := decodeIdTokenClaims(raw)
	if err != nil {
		return idTokenClaims{}, err
	}

	if len(claims.Email) > 0 || len(discovered.UserInfoEndpoint()) == 0 {
		return claims, nil
	}

	// Best effort: several providers (Twitch notably) will not put email in the ID
	// token. Email is display-only here, so a failure is logged and ignored rather
	// than failing an otherwise valid login.
	info, err := discovered.UserInfo(ctx, config.TokenSource(ctx, token))
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "OIDC userinfo lookup failed: "+err.Error())
		return claims, nil
	}

	if info.Subject == claims.Subject {
		claims.Email = info.Email
		claims.EmailVerified = tolerantBool(info.EmailVerified)
	}

	return claims, nil
}

func finishLogin(
	w http.ResponseWriter,
	r *http.Request,
	providerRow models.OidcProvider,
	claims idTokenClaims,
	session models.OidcAuthSession,
) {
	user, err := resolveUser(providerRow, claims)
	if err != nil {
		redirectWithError(w, r, resolutionErrorCode(err))
		return
	}

	issueSession(w, r, user.ID)
}

func finishLink(
	w http.ResponseWriter,
	r *http.Request,
	providerRow models.OidcProvider,
	claims idTokenClaims,
	session models.OidcAuthSession,
) {
	err := resolveLink(providerRow, claims, *session.LinkUserId)
	if err != nil {
		redirectSignedInError(w, r, models.OidcPurposeLink, resolutionErrorCode(err))
		return
	}

	redirectLinkSuccess(w, r, providerRow.Name)
}

// finishDeleteConfirmation hands back the code that lets an account with no
// password of its own delete itself, once two things hold:
//
//   - The identity that just signed in is the account's OWN identity at this
//     provider. Signing in as anyone else -- another user's identity, or one
//     nobody has linked -- confirms nothing about this account.
//   - The sign-in was fresh. When the provider sends auth_time it must not
//     predate the start of this flow (allowing for clock skew), or the provider
//     ignored max_age=0 and simply reused an old session. When auth_time is
//     absent the round trip is accepted: refusing would leave every user of a
//     provider that never sends it unable to delete their account, which is the
//     requirement this whole flow exists to meet.
//
// Nothing is deleted here. The code goes back to the client, which spends it on
// POST /user/deleteAccount from its own signed-in session -- so the delete keeps
// one endpoint, one permission check and one interactive-session check.
func finishDeleteConfirmation(
	w http.ResponseWriter,
	r *http.Request,
	providerRow models.OidcProvider,
	claims idTokenClaims,
	session models.OidcAuthSession,
) {
	purpose := models.OidcPurposeDeleteAccount
	userId := *session.LinkUserId

	identity, err := repositories.NewOidcIdentityRepository(nil).GetIdentityBySubject(providerRow.ID, claims.Subject)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to load the identity for a delete confirmation: "+err.Error())
		redirectSignedInError(w, r, purpose, errServerError)
		return
	}

	if err != nil || identity.UserId != userId {
		redirectSignedInError(w, r, purpose, errIdentityMismatch)
		return
	}

	if authTime := claims.AuthTime.Time(); authTime != nil && authTime.Before(session.CreatedAt.Add(-authTimeSkew)) {
		redirectSignedInError(w, r, purpose, errStaleLogin)
		return
	}

	code, err := createDeleteConfirmation(userId)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to create a delete confirmation: "+err.Error())
		redirectSignedInError(w, r, purpose, errServerError)
		return
	}

	http.Redirect(w, r, desktopProfilePath+"?tab=user-profile&deleteConfirmation="+url.QueryEscape(code), http.StatusFound)
}

// failCallback reports a callback failure to wherever the flow actually started
// from: sending a signed-in flow to the login screen is exactly what
// redirectSignedInError exists to prevent -- its caller is already signed in, so a
// login form reads as "you have been signed out" rather than "that provider could
// not be connected".
//
// Every branch targets fixed, server-side constants, and session is our own row
// -- consumed atomically a few lines earlier, or read from the pending state --
// so nothing a caller supplies reaches a redirect target here.
func failCallback(w http.ResponseWriter, r *http.Request, session models.OidcAuthSession, code string) {
	if purpose := session.FlowPurpose(); purpose != models.OidcPurposeLogin {
		redirectSignedInError(w, r, purpose, code)
		return
	}

	redirectWithError(w, r, code)
}

// redirectLinkSuccess returns a completed "connect account" flow to the profile
// page, carrying only the provider's name: a link mints no session.
func redirectLinkSuccess(w http.ResponseWriter, r *http.Request, providerName string) {
	http.Redirect(w, r, desktopProfilePath+"?tab=user-profile&oidcLinked="+url.QueryEscape(providerName), http.StatusFound)
}

// redirectSignedInError reports a failed signed-in flow -- a link or a delete
// confirmation -- on the profile page the user started from.
//
// Deliberately NOT redirectWithError, which lands on the login screen: a
// signed-in flow's caller is already signed in, so bouncing them to a login form
// reads as "you have been signed out" rather than "that provider could not be
// connected". The two flows report under different query parameters, so the
// page can say which attempt failed.
func redirectSignedInError(w http.ResponseWriter, r *http.Request, purpose string, code string) {
	parameter := "oidcError"
	if purpose == models.OidcPurposeDeleteAccount {
		parameter = "deleteError"
	}

	http.Redirect(w, r, desktopProfilePath+"?tab=user-profile&"+parameter+"="+url.QueryEscape(code), http.StatusFound)
}

// issueSession mints CartVibe tokens and hands them to the browser as cookies.
func issueSession(w http.ResponseWriter, r *http.Request, userId uint) {
	jwt, refreshToken, _, err := services.GenerateJWT(userId)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to mint tokens after OIDC login: "+err.Error())
		redirectWithError(w, r, errServerError)
		return
	}

	_, err = repositories.NewUserRepository(nil).UpdateUserLastLoginDate(userId)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to stamp last login date after OIDC login: "+err.Error())
	}

	accessTokenCookie, refreshTokenCookie := services.BuildTokenCookies(jwt, refreshToken)
	http.SetCookie(w, &accessTokenCookie)
	http.SetCookie(w, &refreshTokenCookie)

	http.Redirect(w, r, desktopCallbackPath, http.StatusFound)
}

func resolutionErrorCode(err error) string {
	switch {
	case errors.Is(err, ErrNoAccount), errors.Is(err, ErrUserIsDummy):
		return errNoAccount
	case errors.Is(err, ErrAccountExists):
		return errAccountExists
	case errors.Is(err, ErrAlreadyLinked), errors.Is(err, ErrIdentityLinkedElsewhere):
		return errAlreadyLinked
	default:
		logging.LogStd(logging.LOG_LEVEL_ERROR, "OIDC identity resolution failed: "+err.Error())
		return errServerError
	}
}

// failBrowserFlowStart reports a start failure to the browser, sending it back
// wherever it came from: the profile page for a signed-in flow, the login screen
// for a login.
func failBrowserFlowStart(w http.ResponseWriter, r *http.Request, purpose string, code string) {
	if purpose != models.OidcPurposeLogin {
		redirectSignedInError(w, r, purpose, code)
		return
	}

	redirectWithError(w, r, code)
}

func redirectWithError(w http.ResponseWriter, r *http.Request, code string) {
	http.Redirect(w, r, desktopLoginPath+"?oidcError="+url.QueryEscape(code), http.StatusFound)
}

// pendingSession recovers what a flow we have not consumed yet is for, so a
// pre-session failure can answer where that caller can receive it. Only the
// routing columns are loaded. Anything it cannot establish -- an absent state, an
// unknown, expired or already-spent one, a failed read -- degrades to a login.
//
// The result chooses between fixed redirect constants and nothing else, so an
// attacker who feeds it a state they already hold learns only that it is live.
// Nothing is consumed, so a failed callback still leaves the real one able to
// complete.
func pendingSession(state string) models.OidcAuthSession {
	desktopLogin := models.OidcAuthSession{}

	if len(state) == 0 {
		return desktopLogin
	}

	session, err := repositories.NewOidcSessionRepository(nil).GetPendingAuthSessionRouting(hashSecret(state))
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Failed to read a pending OIDC session's routing: "+err.Error())
		return desktopLogin
	}

	return session
}

func buildBindingCookie(value string) *http.Cookie {
	return &http.Cookie{
		Name:     bindingCookieName,
		Value:    value,
		HttpOnly: true,
		Path:     bindingCookiePath,
		MaxAge:   int(authSessionTTL.Seconds()),
		Secure:   services.UseSecureCookies(),
		// Lax, NOT Strict. BuildTokenCookies uses Strict in production, but the
		// callback arrives as a cross-site top-level GET from the identity provider:
		// Strict would drop this cookie on exactly the request that needs it, and the
		// flow would fail only in production.
		SameSite: http.SameSiteLaxMode,
	}
}

// clearBindingCookie expires the browser binding once it has served its purpose.
//
// It is a no-op when the request did not carry one, so a request without the
// cookie emits no Set-Cookie header.
func clearBindingCookie(w http.ResponseWriter, r *http.Request) {
	if _, err := r.Cookie(bindingCookieName); err != nil {
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     bindingCookieName,
		Value:    "",
		HttpOnly: true,
		Path:     bindingCookiePath,
		MaxAge:   -1,
		Secure:   services.UseSecureCookies(),
	})
}

func bindingMatches(r *http.Request, bindingHash string) bool {
	cookie, err := r.Cookie(bindingCookieName)
	if err != nil || len(cookie.Value) == 0 {
		return false
	}

	return utils.SecureCompare(hashSecret(cookie.Value), bindingHash)
}
