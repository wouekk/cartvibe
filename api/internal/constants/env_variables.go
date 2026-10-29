package constants

type EnvironmentVariable string

const (
	EncryptionKey EnvironmentVariable = "ENCRYPTION_KEY"
	// VapidPublicKey / VapidPrivateKey sign Web Push messages (warranty reminders). Unset means no push.
	VapidPublicKey  EnvironmentVariable = "VAPID_PUBLIC_KEY"
	VapidPrivateKey EnvironmentVariable = "VAPID_PRIVATE_KEY"
	// VapidSubject is the contact the push services see ("mailto:you@example.com" or an https URL).
	VapidSubject  EnvironmentVariable = "VAPID_SUBJECT"
	SecretKey     EnvironmentVariable = "SECRET_KEY"
	DbUser        EnvironmentVariable = "DB_USER"
	DbPassword    EnvironmentVariable = "DB_PASSWORD"
	DbHost        EnvironmentVariable = "DB_HOST"
	DbPort        EnvironmentVariable = "DB_PORT"
	DbName        EnvironmentVariable = "DB_NAME"
	DbFileName    EnvironmentVariable = "DB_FILENAME"
	DbEngine      EnvironmentVariable = "DB_ENGINE"
	RedisHost     EnvironmentVariable = "REDIS_HOST"
	RedisPort     EnvironmentVariable = "REDIS_PORT"
	RedisUser     EnvironmentVariable = "REDIS_USER"
	RedisPassword EnvironmentVariable = "REDIS_PASSWORD"
	BasePath      EnvironmentVariable = "BASE_PATH"
	Env           EnvironmentVariable = "ENV"

	ChromiumBinaryPath             EnvironmentVariable = "CHROMIUM_BINARY_PATH"
	ChromiumSandbox                EnvironmentVariable = "CHROMIUM_SANDBOX"
	ChromiumAllowExternalResources EnvironmentVariable = "CHROMIUM_ALLOW_EXTERNAL_RESOURCES"
)
