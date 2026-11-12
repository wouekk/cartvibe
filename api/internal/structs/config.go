package structs

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
	// asks the server for the downloaded logos. The key never leaves the server.
	ShopLogosEnabled bool `json:"shopLogosEnabled"`
	// WebPushPublicKey is the server's VAPID public key, which a browser needs to subscribe to Web Push; "" when the
	// server has no VAPID keys, and then the app offers no push.
	WebPushPublicKey string `json:"webPushPublicKey"`
}

// DatabaseConfig is the SQLite file the app opens; sqlite is the only engine.
type DatabaseConfig struct {
	Engine   string `json:"engine"`
	Filename string `json:"filename"`
}
