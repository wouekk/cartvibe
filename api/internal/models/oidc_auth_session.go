package models

import "time"

// What an OIDC flow is for. Server-side only -- never on the wire.
const (
	// OidcPurposeLogin signs a user in. It is the zero value, which is also what
	// every row written before Purpose existed carries.
	OidcPurposeLogin = ""

	// OidcPurposeLink connects a provider to the signed-in account.
	OidcPurposeLink = "link"

	// OidcPurposeDeleteAccount confirms that the signed-in account, which has no
	// password of its own, should be deleted.
	OidcPurposeDeleteAccount = "delete_account"
)

// resolveSignedInPurpose reads the purpose of a flow started by a signed-in
// account. Anything but a delete confirmation is a link, which is what such a
// row meant before Purpose existed, so a session in flight across the deploy
// keeps its meaning.
func resolveSignedInPurpose(purpose string) string {
	if purpose == OidcPurposeDeleteAccount {
		return OidcPurposeDeleteAccount
	}

	return OidcPurposeLink
}

// OidcAuthSession is the server-side state for one in-flight OIDC login. It is
// created when the user is redirected to the IdP and consumed exactly once when
// the IdP redirects back.
//
// State and nonce are stored HASHED (utils.Sha256Hash), matching how
// RefreshToken.Token is stored: they are bearer secrets we only ever compare, so
// a database dump, replica or backup cannot be used to complete a pending login.
// CodeVerifier is the exception — it must be replayed to the IdP verbatim, so it
// is AES-GCM encrypted rather than hashed.
type OidcAuthSession struct {
	BaseModel

	OidcProviderId uint `gorm:"not null;index" json:"-"`

	// StateHash is sha256(state). The raw state only ever exists in the redirect
	// URL and the IdP's callback query.
	StateHash string `gorm:"not null;uniqueIndex;size:64" json:"-"`

	// NonceHash is sha256(nonce), compared in constant time against the ID token's
	// `nonce` claim. go-oidc's Verify explicitly does NOT check the nonce — that is
	// the caller's job, and skipping it re-opens ID-token replay.
	NonceHash string `gorm:"not null;size:64" json:"-"`

	// BindingHash is sha256 of a short-lived HttpOnly cookie value set when the
	// flow starts. It defends against login CSRF: without it an attacker can start
	// a flow, harvest the state, and complete it as themselves -- signing the victim
	// into the attacker's account on a login, or grafting the attacker's identity
	// onto the victim's account on a link.
	//
	// Set on EVERY session. The column is nullable rather than NOT NULL: the
	// invariant is enforced where it is created, and the callback fails closed on an
	// empty hash.
	BindingHash string `gorm:"size:64" json:"-"`

	// CodeVerifier is OUR PKCE verifier toward the IdP, encrypted at rest.
	CodeVerifier string `gorm:"not null" json:"-"`

	// LinkUserId non-nil means the flow was started by a SIGNED-IN account rather
	// than a login: a "connect account" link or a delete confirmation, as Purpose
	// says. Either way the callback skips the whole match/provision decision tree
	// and acts on this user directly. The name predates the delete confirmation and
	// is kept because the column is shared.
	LinkUserId *uint `gorm:"index" json:"-"`

	// Purpose says what a signed-in flow is for; see FlowPurpose.
	Purpose string `gorm:"not null;default:''" json:"-"`

	Used      bool      `gorm:"not null;default:false;index" json:"-"`
	ExpiresAt time.Time `gorm:"index" json:"-"`
}

// FlowPurpose reports what this session is for. A session with no LinkUserId is
// always a login, whatever Purpose holds.
func (s OidcAuthSession) FlowPurpose() string {
	if s.LinkUserId == nil {
		return OidcPurposeLogin
	}

	return resolveSignedInPurpose(s.Purpose)
}

// IsLink reports whether this session was started from an authenticated session
// to attach a provider to an existing account.
func (s OidcAuthSession) IsLink() bool {
	return s.FlowPurpose() == OidcPurposeLink
}

// IsDeleteConfirmation reports whether this session confirms deleting the
// signed-in account that started it.
func (s OidcAuthSession) IsDeleteConfirmation() bool {
	return s.FlowPurpose() == OidcPurposeDeleteAccount
}
