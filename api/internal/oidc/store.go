package oidc

import (
	"cartvibe/api/internal/env"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"time"
)

const (
	// authSessionTTL bounds one in-flight login. It has to cover typing
	// credentials at the identity provider plus an MFA prompt, and every extra
	// minute widens the window in which a stolen state is still redeemable. Same
	// order of magnitude as the OAuth server's own authorization-code TTL.
	authSessionTTL = 10 * time.Minute

	// deleteConfirmationTTL bounds the gap between the provider sign-in that
	// confirms an account deletion and the client's delete request. One automatic
	// hand-off, so it is short; it is not tighter still only because the request
	// waits on the app or page coming back to the foreground.
	deleteConfirmationTTL = 5 * time.Minute

	// randomTokenBytes is the entropy behind state, nonce, the browser binding,
	// the delete confirmation code.
	randomTokenBytes = 32
)

// newAuthSessionParams carries what createAuthSession needs to persist.
type newAuthSessionParams struct {
	ProviderId   uint
	LinkUserId   *uint
	Purpose      string
	CodeVerifier string
}

// createdAuthSession holds the raw secrets, which exist only in memory and in
// the redirect this request is about to write.
type createdAuthSession struct {
	State   string
	Nonce   string
	Binding string
}

// createAuthSession mints the state, nonce and browser binding, and persists the
// session with the secrets HASHED.
//
// Hashing matters because these are bearer secrets we only ever compare: a
// database dump, replica or backup then cannot be used to complete somebody's
// pending login. The PKCE verifier is the one value that cannot be hashed -- it
// has to be replayed to the identity provider verbatim -- so it is encrypted
// instead, the same treatment the IMAP password and AI provider key get.
func createAuthSession(params newAuthSessionParams) (createdAuthSession, error) {
	state, err := utils.GetRandomUrlSafeString(randomTokenBytes)
	if err != nil {
		return createdAuthSession{}, err
	}

	nonce, err := utils.GetRandomUrlSafeString(randomTokenBytes)
	if err != nil {
		return createdAuthSession{}, err
	}

	binding, err := utils.GetRandomUrlSafeString(randomTokenBytes)
	if err != nil {
		return createdAuthSession{}, err
	}

	encryptedVerifier, err := utils.EncryptAndEncodeToBase64(env.GetEncryptionKey(), params.CodeVerifier)
	if err != nil {
		return createdAuthSession{}, err
	}

	session := models.OidcAuthSession{
		OidcProviderId: params.ProviderId,
		StateHash:      hashSecret(state),
		NonceHash:      hashSecret(nonce),
		CodeVerifier:   encryptedVerifier,
		LinkUserId:     params.LinkUserId,
		Purpose:        params.Purpose,
		ExpiresAt:      time.Now().Add(authSessionTTL),
	}

	// EVERY session is bound to the user agent that started it. Binding stops an
	// attacker DRIVING your flow; the identity provider's own state alone does not.
	session.BindingHash = hashSecret(binding)

	err = repositories.NewOidcSessionRepository(nil).CreateAuthSession(&session)
	if err != nil {
		return createdAuthSession{}, err
	}

	return createdAuthSession{State: state, Nonce: nonce, Binding: binding}, nil
}

func consumeAuthSession(state string) (models.OidcAuthSession, bool, error) {
	return repositories.NewOidcSessionRepository(nil).ConsumeAuthSession(hashSecret(state))
}

func decryptVerifier(session models.OidcAuthSession) (string, error) {
	return utils.DecryptB64EncodedData(env.GetEncryptionKey(), session.CodeVerifier)
}

// createDeleteConfirmation issues the code an OIDC-only account presents to
// delete itself, once its own identity has signed in at the provider again.
func createDeleteConfirmation(userId uint) (string, error) {
	code, err := utils.GetRandomUrlSafeString(randomTokenBytes)
	if err != nil {
		return "", err
	}

	row := models.OidcDeleteConfirmation{
		CodeHash:  hashSecret(code),
		UserId:    userId,
		ExpiresAt: time.Now().Add(deleteConfirmationTTL),
	}

	err = repositories.NewOidcSessionRepository(nil).CreateDeleteConfirmation(&row)
	if err != nil {
		return "", err
	}

	return code, nil
}

// hashSecret is the single hashing entry point for every OIDC bearer secret, so
// the write side and the lookup side cannot drift.
func hashSecret(raw string) string {
	return utils.Sha256Hash([]byte(raw))
}
