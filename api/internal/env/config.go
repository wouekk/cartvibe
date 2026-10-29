package env

import (
	"flag"
	"os"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
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
// process sandbox enabled. Defaults to false: the image runs the API as uid
// 10001, but the sandbox needs user namespaces, which Docker's default
// security profile (and some NAS kernels) block. Operators whose runtime
// allows them can opt in by setting CHROMIUM_SANDBOX to a truthy value
// (1, t, true, etc.). An
// unparseable value (e.g. yes/on/enabled) is logged at INFO and treated
// as the default (disabled) so misconfigurations are visible rather than
// silently ignored.
func GetChromiumSandboxEnabled() bool {
	return parseBoolEnv(constants.ChromiumSandbox, false)
}

// GetChromiumAllowExternalResources reports whether chromium should be
// allowed to load network resources (remote images, CSS, fonts) referenced
// from rendered HTML. Defaults to false: secure-by-default, no SSRF /
// tracking-pixel exposure, no remote-asset latency. Operators who need
// remote logos or product imagery in rendered receipts can opt in via
// CHROMIUM_ALLOW_EXTERNAL_RESOURCES=true.
func GetChromiumAllowExternalResources() bool {
	return parseBoolEnv(constants.ChromiumAllowExternalResources, false)
}

// parseBoolEnv reads a boolean env var with a default. Unparseable values
// are logged at INFO and treated as the default so misconfigurations
// surface in logs rather than being silently swapped to one side.
func parseBoolEnv(name constants.EnvironmentVariable, defaultValue bool) bool {
	raw := os.Getenv(string(name))
	if raw == "" {
		return defaultValue
	}
	enabled, err := strconv.ParseBool(raw)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_INFO,
			string(name)+" has unparseable value (use 1/0/true/false), using default: ",
			raw,
		)
		return defaultValue
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

// basePathDirNames are the directory names that mark the API root when BASE_PATH
// is not set: the image's folder, and the pre-rename one older installs still use.
var basePathDirNames = []string{"cartvibe-api", "receipt-wrangler-api"}

func setBasePath() {
	cwd, _ := os.Getwd()
	basePath = findBasePath(cwd)
}

// findBasePath returns the part of cwd up to and including the first directory
// named like the API root, or cwd itself when it is a plain `api` folder (a local
// checkout). It accepts both slash styles, so it also works on Windows.
func findBasePath(cwd string) string {
	slashed := strings.ReplaceAll(cwd, "\\", "/")
	parts := strings.Split(slashed, "/")

	for i, part := range parts {
		for _, name := range basePathDirNames {
			if part == name {
				return strings.Join(parts[:i+1], "/")
			}
		}
	}

	if parts[len(parts)-1] == "api" {
		return slashed
	}

	return ""
}
