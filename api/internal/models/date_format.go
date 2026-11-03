package models

// DefaultDateFormat is the household's date format when none is set or the stored one is unknown.
const DefaultDateFormat = "DD/MM/YYYY"

// DateFormats are the date formats a household can pick under System Settings → General. They are plain strings on
// the contract (never an enum), so a client that meets a newer one falls back to its default instead of failing.
var DateFormats = []string{
	"DD/MM/YYYY",
	"MM/DD/YYYY",
	"YYYY/MM/DD",
	"DD.MM.YYYY",
	"YYYY-MM-DD",
}

func IsDateFormat(value string) bool {
	for _, format := range DateFormats {
		if format == value {
			return true
		}
	}
	return false
}

// ResolveDateFormat returns the stored format, or the default when it is empty or unknown.
func ResolveDateFormat(value string) string {
	if IsDateFormat(value) {
		return value
	}
	return DefaultDateFormat
}
