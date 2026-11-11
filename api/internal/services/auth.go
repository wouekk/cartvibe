package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"time"

	"github.com/auth0/go-jwt-middleware/v2/validator"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

func customClaims() validator.CustomClaims {
	return &structs.Claims{}
}

// jwtIssuer is the issuer stamped on, and required of, every CartVibe
// JWT regardless of audience. It is a label only; nothing connects to it.
// Changing it invalidates every issued token (everyone signs in again).
const jwtIssuer = "https://cartvibe.app"

// defaultAudience is the audience for normal REST API tokens. MCP tokens use a
// distinct, runtime-derived audience instead (see GenerateMcpJWT) so an MCP
// token is rejected everywhere except the MCP endpoints.
const defaultAudience = "https://cartvibe.app"

// defaultRefreshTokenLifetime is the fallback lifetime of a person's session, used when the System Settings value
// is unset (0), out of range, or unreadable: 30 days, so a family member who skipped a few days is still signed in.
const defaultRefreshTokenLifetime = repositories.DefaultSessionLifetimeHours * time.Hour

// defaultMcpRefreshTokenLifetime is the same fallback for MCP/OAuth connector tokens, which stay short: a day.
const defaultMcpRefreshTokenLifetime = 24 * time.Hour

// GetRefreshTokenLifetime returns how long a REST refresh token stays valid.
//
// Refresh tokens rotate on every use, so this is an inactivity window rather
// than an absolute session cap: an actively refreshing client is never logged
// out, while an idle one must re-authenticate once it exceeds the window.
func GetRefreshTokenLifetime() time.Duration {
	systemSettings, err := repositories.NewSystemSettingsRepository(nil).GetSystemSettings()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Could not read refresh token lifetime, using default: "+err.Error())
		return defaultRefreshTokenLifetime
	}

	return clampRefreshTokenLifetime(systemSettings.RefreshTokenValidForHours, commands.MaxRefreshTokenValidForHours, defaultRefreshTokenLifetime)
}

// GetMcpRefreshTokenLifetime returns how long an MCP/OAuth connector refresh
// token stays valid. It is a separate setting from GetRefreshTokenLifetime so a
// long window chosen for human convenience does not silently extend tokens held
// by third-party clients.
func GetMcpRefreshTokenLifetime() time.Duration {
	systemSettings, err := repositories.NewSystemSettingsRepository(nil).GetSystemSettings()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Could not read MCP refresh token lifetime, using default: "+err.Error())
		return defaultMcpRefreshTokenLifetime
	}

	return clampRefreshTokenLifetime(systemSettings.McpRefreshTokenValidForHours, commands.MaxMcpRefreshTokenValidForHours, defaultMcpRefreshTokenLifetime)
}

// clampRefreshTokenLifetime converts a configured hour count into a duration,
// falling back to the given default for anything outside the supported range. This is
// the real safety net — it stops a bad stored value (0, negative, absurd) from
// ever producing a token, independent of whether the value passed command
// validation on the way in.
func clampRefreshTokenLifetime(hours int, maxHours int, fallback time.Duration) time.Duration {
	if hours < commands.MinRefreshTokenValidForHours || hours > maxHours {
		return fallback
	}

	return time.Duration(hours) * time.Hour
}

func InitTokenValidator() (*validator.Validator, error) {
	return initTokenValidator(defaultAudience)
}

// InitMcpTokenValidator builds a validator that only accepts tokens carrying
// the given MCP audience. Because the normal validator requires
// defaultAudience and our token minting replaces (never appends) the audience,
// an MCP token fails validation on every REST endpoint and a normal token
// fails validation on the MCP endpoints.
func InitMcpTokenValidator(audience string) (*validator.Validator, error) {
	return initTokenValidator(audience)
}

func initTokenValidator(audience string) (*validator.Validator, error) {
	keyFunc := func(ctx context.Context) (interface{}, error) {
		return []byte(config.GetSecretKey()), nil
	}
	jwtValidator, err := validator.New(
		keyFunc,
		validator.HS512,
		jwtIssuer,
		[]string{audience},
		validator.WithCustomClaims(customClaims),
		validator.WithAllowedClockSkew(30*time.Second),
	)

	return jwtValidator, err
}

// ErrPasswordLoginUnavailable means the account has no password of its own -- it
// was created by an OIDC provisioning login and nobody has set one since -- so it
// may only sign in through its identity provider.
var ErrPasswordLoginUnavailable = errors.New("this account signs in through an identity provider")

// LoginUser checks a password sign-in. Every refusal wraps ErrInvalidCredentials (an account that signs in through
// its provider also wraps ErrPasswordLoginUnavailable); a user name with too many failures in a row gets
// ErrLoginThrottled before any lookup or bcrypt (login_throttle.go).
func LoginUser(loginAttempt commands.LoginCommand) (models.User, bool, error) {
	if wait := defaultLoginThrottle.wait(loginAttempt.Username); wait > 0 {
		return models.User{}, false, fmt.Errorf("%w (%s left)", ErrLoginThrottled, wait.Round(time.Second))
	}
	user, firstAdmin, err := checkLogin(loginAttempt)
	if errors.Is(err, ErrInvalidCredentials) {
		defaultLoginThrottle.recordFailure(loginAttempt.Username)
	} else if err == nil {
		defaultLoginThrottle.recordSuccess(loginAttempt.Username)
	}
	return user, firstAdmin, err
}

func checkLogin(loginAttempt commands.LoginCommand) (models.User, bool, error) {
	db := repositories.GetDB()
	firstAdminToLogin := false
	var dbUser models.User

	// Reject empty passwords before any lookup. Dummy/placeholder accounts are
	// stored as bcrypt("") and would otherwise verify against an empty password,
	// and no legitimate login uses an empty password. Centralizing this (and the
	// dummy-user guard below) here means every caller is protected — the REST
	// login handler AND the OAuth/MCP authorize form — rather than relying on
	// each caller to re-check. (REST additionally rejects this at the middleware.)
	if len(loginAttempt.Password) == 0 {
		return models.User{}, false, fmt.Errorf("%w: password is required", ErrInvalidCredentials)
	}

	err := db.Model(models.User{}).Where("username = ?", loginAttempt.Username).First(&dbUser).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return models.User{}, false, fmt.Errorf("%w: unknown user", ErrInvalidCredentials)
	}
	if err != nil {
		return models.User{}, false, err
	}

	// Dummy (passwordless placeholder) users can never authenticate, regardless
	// of the submitted password.
	if dbUser.IsDummyUser {
		return models.User{}, false, fmt.Errorf("%w: dummy users cannot log in", ErrInvalidCredentials)
	}

	err = utils.VerifyPassword(dbUser.Password, loginAttempt.Password)
	if err != nil {
		return models.User{}, false, fmt.Errorf("%w: %w", ErrInvalidCredentials, err)
	}

	// An account with no password of its own signs in through its identity
	// provider only. Its stored password is random and was never shown to anyone,
	// so this holds the rule rather than stopping a guess. It runs AFTER the
	// password check on purpose: every caller answers this error exactly like a
	// wrong password, and asking first would answer faster than bcrypt and tell
	// anyone which usernames are identity provider accounts.
	passwordless, err := repositories.NewOidcIdentityRepository(nil).IsAccountPasswordless(dbUser.ID)
	if err != nil {
		return models.User{}, false, err
	}
	if passwordless {
		return models.User{}, false, fmt.Errorf("%w: %w", ErrInvalidCredentials, ErrPasswordLoginUnavailable)
	}

	userRepository := repositories.NewUserRepository(nil)

	// "Administrator" is defined by the app.users.read permission (the modern
	// replacement for the removed UserRole == ADMIN check), resolved from the
	// database rather than the JWT.
	permissionService := NewPermissionService(nil)
	isAdmin, err := permissionService.HasAppPermissions(dbUser.ID, permissions.AppUsersRead)
	if err != nil {
		return models.User{}, false, err
	}
	if isAdmin {
		firstAdminToLogin, err = userRepository.IsFirstAdminToLogin()
		if err != nil {
			return models.User{}, false, err
		}
	}

	lastLoginDate, err := userRepository.UpdateUserLastLoginDate(dbUser.ID)
	if err != nil {
		return models.User{}, false, err
	}

	dbUser.LastLoginDate = &lastLoginDate
	return dbUser, firstAdminToLogin, nil
}

// UseSecureCookies reports whether the cookies the API sets should carry the
// Secure attribute. Every cookie builder asks this one function, so the session
// cookies, their expiry cookies and the OIDC binding cookie can never disagree.
//
// It is always true in dev, where BuildTokenCookies uses SameSite=None and
// browsers reject a None cookie without Secure. Everywhere else it is the
// secureCookies System Setting, read live (the IsMcpEnabled pattern) so a save
// applies on the next response. It is off by default because a browser drops a
// Secure cookie set over plain http, which would break login on a LAN install;
// a failed read falls back to that same default.
func UseSecureCookies() bool {
	if config.GetDeployEnv() == "dev" {
		return true
	}

	systemSettings, err := repositories.NewSystemSettingsRepository(nil).GetSystemSettings()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Could not read secure cookies setting, leaving cookies non-secure: "+err.Error())
		return false
	}

	return systemSettings.SecureCookies
}

func BuildTokenCookies(jwt string, refreshToken string) (http.Cookie, http.Cookie) {
	var sameSite = http.SameSiteStrictMode
	var secure = UseSecureCookies()

	if config.GetDeployEnv() == "dev" {
		sameSite = http.SameSiteNoneMode
	}

	accessTokenCookie := http.Cookie{Name: constants.JwtKey, Value: jwt, HttpOnly: true, Path: "/", Expires: utils.GetAccessTokenExpiryDate().Time, SameSite: sameSite, Secure: secure}
	// Resolved here rather than threaded in from the caller: both call sites
	// (login and token refresh) are REST-only, never MCP, so the app setting is
	// always the right one. Costs one extra System Settings read per login.
	refreshTokenCookie := http.Cookie{Name: constants.RefreshTokenKey, Value: refreshToken, HttpOnly: true, Path: constants.RefreshTokenCookiePath, Expires: utils.GetRefreshTokenExpiryDate(GetRefreshTokenLifetime()).Time, SameSite: sameSite, Secure: secure}

	return accessTokenCookie, refreshTokenCookie
}

// SetSessionCookies sets the two session cookies and expires a refresh cookie left at the path "/" by an older
// version, so the browser keeps one copy only.
func SetSessionCookies(w http.ResponseWriter, jwt string, refreshToken string) {
	accessTokenCookie, refreshTokenCookie := BuildTokenCookies(jwt, refreshToken)
	legacyRefreshTokenCookie := getEmptyLegacyRefreshTokenCookie()
	http.SetCookie(w, &accessTokenCookie)
	http.SetCookie(w, &refreshTokenCookie)
	http.SetCookie(w, &legacyRefreshTokenCookie)
}

// ClearSessionCookies expires both session cookies, the refresh cookie at its old path "/" included.
func ClearSessionCookies(w http.ResponseWriter) {
	accessTokenCookie := GetEmptyAccessTokenCookie()
	refreshTokenCookie := GetEmptyRefreshTokenCookie()
	legacyRefreshTokenCookie := getEmptyLegacyRefreshTokenCookie()
	http.SetCookie(w, &accessTokenCookie)
	http.SetCookie(w, &refreshTokenCookie)
	http.SetCookie(w, &legacyRefreshTokenCookie)
}

func getEmptyLegacyRefreshTokenCookie() http.Cookie {
	return http.Cookie{Name: constants.RefreshTokenKey, Value: "", HttpOnly: true, Path: "/", MaxAge: -1, Secure: UseSecureCookies()}
}

func PrepareAccessTokenClaims(accessTokenClaims structs.Claims) {
	accessTokenClaims.Issuer = ""
	accessTokenClaims.Audience = make([]string, 0)
}

func GetEmptyAccessTokenCookie() http.Cookie {
	return http.Cookie{Name: constants.JwtKey, Value: "", HttpOnly: false, Path: "/", MaxAge: -1, Secure: UseSecureCookies()}
}

func GetEmptyRefreshTokenCookie() http.Cookie {
	return http.Cookie{Name: constants.RefreshTokenKey, Value: "", HttpOnly: true, Path: constants.RefreshTokenCookiePath, MaxAge: -1, Secure: UseSecureCookies()}
}

func GenerateJWT(userId uint) (string, string, structs.Claims, error) {
	return generateTokenPair(userId, defaultAudience, GetRefreshTokenLifetime())
}

// GenerateMcpJWT mints an access + refresh token pair bound to the given MCP
// audience instead of the normal REST audience. The audience is set on BOTH
// tokens: the refresh token matters most, because if it kept the normal
// audience an MCP client could trade it for a full-access token at /api/token.
// Replacing (not appending) the audience ensures the resulting tokens are
// accepted only by the MCP endpoints, which verify this exact audience.
func GenerateMcpJWT(userId uint, audience string) (string, string, structs.Claims, error) {
	return generateTokenPair(userId, audience, GetMcpRefreshTokenLifetime())
}

func generateTokenPair(userId uint, audience string, refreshLifetime time.Duration) (string, string, structs.Claims, error) {
	db := repositories.GetDB()
	var user models.User

	err := db.Model(models.User{}).Where("id = ?", userId).First(&user).Error
	if err != nil {
		return "", "", structs.Claims{}, err
	}

	accessTokenClaims := structs.Claims{
		DefaultAvatarColor: user.DefaultAvatarColor,
		Displayname:        user.DisplayName,
		UserId:             user.ID,
		Username:           user.Username,
		TokenType:          structs.TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    jwtIssuer,
			Audience:  []string{audience},
			ExpiresAt: utils.GetAccessTokenExpiryDate(),
		},
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS512, accessTokenClaims)
	signedString, err := accessToken.SignedString([]byte(config.GetSecretKey()))

	if err != nil {
		return "", "", structs.Claims{}, err
	}

	refreshTokenId, err := utils.GetRandomString(16)
	if err != nil {
		return "", "", structs.Claims{}, err
	}

	refreshTokenClaims := structs.Claims{
		DefaultAvatarColor: user.DefaultAvatarColor,
		Displayname:        user.DisplayName,
		UserId:             user.ID,
		Username:           user.Username,
		TokenType:          structs.TokenTypeRefresh,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    jwtIssuer,
			Audience:  []string{audience},
			ExpiresAt: utils.GetRefreshTokenExpiryDate(refreshLifetime),
			ID:        refreshTokenId,
		},
	}

	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS512, refreshTokenClaims)
	refreshTokenString, err := refreshToken.SignedString([]byte(config.GetSecretKey()))
	if err != nil {
		return "", "", structs.Claims{}, err
	}

	hashTokenString := utils.Sha256Hash([]byte(refreshTokenString))
	expiresAtFloat := float64(refreshTokenClaims.ExpiresAt.Unix())
	expiresAt := time.Unix(int64(expiresAtFloat), 0).UTC()

	token := models.RefreshToken{
		UserId:    user.ID,
		Token:     hashTokenString,
		IsUsed:    false,
		ExpiresAt: expiresAt,
	}

	err = db.Model(&models.RefreshToken{}).Create(&token).Error
	if err != nil {
		return "", "", structs.Claims{}, err
	}

	return signedString, refreshTokenString, accessTokenClaims, nil
}

func GetAppData(userId uint, r *http.Request) (structs.AppData, error) {
	appData := structs.AppData{}

	aboutRepository := repositories.NewAboutRepository(nil)
	groupService := NewGroupService(nil)
	userRepository := repositories.NewUserRepository(nil)
	userPreferenceRepository := repositories.NewUserPreferencesRepository(nil)
	categoryRepository := repositories.NewCategoryRepository(nil)
	systemSettingsService := NewSystemSettingsService(nil)
	systemSettingsRepository := repositories.NewSystemSettingsRepository(nil)
	tagRepository := repositories.NewTagsRepository(nil)
	stringUserId := utils.UintToString(userId)

	systemSettings, err := systemSettingsRepository.GetSystemSettings()
	if err != nil {
		return appData, err
	}

	groups, err := groupService.GetGroupsForUser(stringUserId)
	if err != nil {
		return appData, err
	}

	users, err := userRepository.GetAllUserViews()
	if err != nil {
		return appData, err
	}

	userPreferences, err := userPreferenceRepository.GetUserPreferencesOrCreate(userId)
	if err != nil {
		return appData, err
	}

	categories, err := categoryRepository.GetAllCategories("*")
	if err != nil {
		return appData, err
	}

	tags, err := tagRepository.GetAllTags("*")
	if err != nil {
		return appData, err
	}

	featureConfig, err := systemSettingsService.GetFeatureConfig()
	if err != nil {
		return appData, err
	}

	about, err := aboutRepository.GetAboutData()
	if err != nil {
		return appData, err
	}

	permissionService := NewPermissionService(nil)
	appPermissions, err := permissionService.GetAppPermissionsForUser(userId)
	if err != nil {
		return appData, err
	}

	groupPermissions := make(map[uint][]string, len(groups))
	groupCategories := make(map[uint][]models.Category, len(groups))
	groupTags := make(map[uint][]models.Tag, len(groups))
	// Categories and tags are the household's shared pool: every household a person is in sees all of them (the
	// per-role and per-member grants that used to narrow a household's catalog went with fixed roles).
	for _, group := range groups {
		perms, err := permissionService.GetGroupPermissionsForUser(userId, group.ID)
		if err != nil {
			return appData, err
		}
		groupPermissions[group.ID] = perms
		groupCategories[group.ID] = categories
		groupTags[group.ID] = tags
	}

	// The flat lists are for whoever may read the catalog pages (app.categories.read / app.tags.read, which both
	// fixed roles hold); without that permission a caller gets them only through the households above.
	canReadAllCategories, err := permissionService.HasAppPermissions(userId, permissions.AppCategoriesRead)
	if err != nil {
		return appData, err
	}
	if !canReadAllCategories {
		categories = []models.Category{}
	}

	canReadAllTags, err := permissionService.HasAppPermissions(userId, permissions.AppTagsRead)
	if err != nil {
		return appData, err
	}
	if !canReadAllTags {
		tags = []models.Tag{}
	}

	appData.About = about
	appData.Groups = groups
	appData.Users = users
	appData.UserPreferences = userPreferences
	appData.FeatureConfig = featureConfig
	appData.Categories = categories
	appData.Tags = tags
	appData.GroupCategories = groupCategories
	appData.GroupTags = groupTags
	appData.CurrencyDisplay = systemSettings.CurrencyDisplay
	appData.CurrencyThousandthsSeparator = systemSettings.CurrencyThousandthsSeparator
	appData.CurrencyDecimalSeparator = systemSettings.CurrencyDecimalSeparator
	appData.CurrencySymbolPosition = systemSettings.CurrencySymbolPosition
	appData.CurrencyHideDecimalPlaces = systemSettings.CurrencyHideDecimalPlaces
	appData.TimeZone = repositories.ResolveAppLocation(systemSettings.TimeZone).String()
	appData.DateFormat = models.ResolveDateFormat(systemSettings.DateFormat)
	appData.Icons = structs.Icons
	appData.AppPermissions = appPermissions
	appData.GroupPermissions = groupPermissions

	if r != nil {
		claims := structs.GetClaims(r)
		PrepareAccessTokenClaims(*claims)
		appData.Claims = *claims
	}

	return appData, nil
}
