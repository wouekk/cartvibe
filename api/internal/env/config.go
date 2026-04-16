package env

import (
	"flag"
	"os"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/logging"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"strconv"
	"strings"
)

var basePath string
var env string

func GetSecretKey() string {
	if len(os.Getenv(string(constants.SecretKey))) == 0 && env != "test" {
		logging.LogStd(logging.LOG_LEVEL_FATAL, constants.EmptySecretKeyError)
	}

	return os.Getenv(string(constants.SecretKey))
}

func GetDatabaseConfig() (structs.DatabaseConfig, error) {
	dbEngine := os.Getenv(string(constants.DbEngine))
	port := os.Getenv(string(constants.DbPort))
	portToUse := 0

	if dbEngine == "postgresql" || dbEngine == "mariadb" || dbEngine == "mysql" {
		parsedPort, err := utils.StringToInt(port)
		if err != nil {
			return structs.DatabaseConfig{}, err
		}

		portToUse = parsedPort
	}

	return structs.DatabaseConfig{
		User:     os.Getenv(string(constants.DbUser)),
		Password: os.Getenv(string(constants.DbPassword)),
		Name:     os.Getenv(string(constants.DbName)),
		Host:     os.Getenv(string(constants.DbHost)),
		Port:     portToUse,
		Engine:   os.Getenv(string(constants.DbEngine)),
		Filename: os.Getenv(string(constants.DbFileName)),
	}, nil
}

func GetBasePath() string {
	envBase := os.Getenv(string(constants.BasePath))
	if len(envBase) == 0 {
		return basePath
	}

	return envBase
}

func GetEncryptionKey() string {
	if len(os.Getenv(string(constants.EncryptionKey))) == 0 && env != "test" {
		logging.LogStd(logging.LOG_LEVEL_FATAL, constants.EmptyEncryptionKeyError)
	}

	return os.Getenv(string(constants.EncryptionKey))
}

func CheckRequiredEnvironmentVariables() {
	GetEncryptionKey()
	GetSecretKey()
}

func GetDeployEnv() string {
	return env
}

func GetChromiumPath() string {
	path := os.Getenv(string(constants.ChromiumBinaryPath))
	if len(path) == 0 {
		return "/usr/bin/chromium"
	}
	return path
}

// GetChromiumSandboxEnabled reports whether chromium should run with its
// process sandbox enabled. Defaults to false because the supported docker
// images run as root and the chromium sandbox refuses to start in that
// situation. Operators running the API as a non-root user can opt back in
// by setting CHROMIUM_SANDBOX to a truthy value (1, t, true, etc.).
func GetChromiumSandboxEnabled() bool {
	raw := os.Getenv(string(constants.ChromiumSandbox))
	if raw == "" {
		return false
	}
	enabled, err := strconv.ParseBool(raw)
	if err != nil {
		return false
	}
	return enabled
}

func SetConfigs() error {
	setEnv()
	setBasePath()

	return nil
}

func setEnv() {
	envFlag := flag.String("env", "dev", "set runtime environment")
	flag.Parse()

	env = *envFlag
	os.Setenv(string(constants.Env), env)
}

func setBasePath() {
	cwd, _ := os.Getwd()
	result := ""
	paths := strings.Split(cwd, "/")

	for i := 0; i < len(paths); i++ {
		result += "/" + paths[i]
		if paths[i] == "receipt-wrangler-api" {
			basePath = result
			return
		}
	}
}
