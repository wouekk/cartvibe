package constants

const JwtKey = "jwt"
const RefreshTokenKey = "refresh_token"

// RefreshTokenCookiePath scopes the refresh cookie to the two routes that read it (POST /api/token/ and
// POST /api/token/logout/), so it is not sent with every other request. Cookies set before 0.19 had the path "/";
// services.SetSessionCookies and ClearSessionCookies expire that copy too.
const RefreshTokenCookiePath = "/api/token"
