package structs

import "cartvibe/api/internal/models"

type EmailSettings struct {
	Host     string
	Port     int
	Username string
	Password string
}

type AiSettings struct {
	AiType     models.AiClientType `json:"type"`
	Key        string              `json:"key"`
	Url        string              `json:"url"`
	Model      string              `json:"model"`
	NumWorkers int                 `json:"numWorkers"`
	OcrEngine  models.OcrEngine    `json:"ocrEngine"`
}

type FeatureConfig struct {
	EnableLocalSignUp bool `json:"enableLocalSignUp"`
	AiPoweredReceipts bool `json:"aiPoweredReceipts"`
	// OidcProviders lets a login screen render one "Log in with X" button per
	// enabled identity provider. It carries only the slug and the display name --
	// never the issuer, the client id, or anything else about the configuration.
	//
	// It MUST always serialize as [] and never null: this payload is fetched
	// unauthenticated by the mobile Connect screen, and the generated Dart
	// deserializer has no null guard, so a null would fail the whole payload on
	// every already-released build.
	OidcProviders []OidcProviderSummary `json:"oidcProviders"`
	// ShopLogosEnabled is true while the household has a Logo.dev key or logos downloaded with one: the app then
	// asks the server for the downloaded logos, and the login page credits Logo.dev. The key never leaves the server.
	ShopLogosEnabled bool `json:"shopLogosEnabled"`
	// WebPushPublicKey is the server's VAPID public key, which a browser needs to subscribe to Web Push; "" when the
	// server has no VAPID keys, and then the app offers no push.
	WebPushPublicKey string `json:"webPushPublicKey"`
}

type DatabaseConfig struct {
	User     string `json:"user"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Engine   string `json:"engine"`
	Filename string `json:"filename"`
}

type RedisConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type DebugConfig struct {
	DebugOcr bool `json:"debugOcr"`
}

type Config struct {
	SecretKey     string          `json:"secretKey"`
	AiSettings    AiSettings      `json:"aiSettings"`
	EmailSettings []EmailSettings `json:"emailSettings"`
	Features      FeatureConfig   `json:"features"`
	Database      DatabaseConfig  `json:"database"`
	Debug         DebugConfig     `json:"debug"`
}
