package services

import (
	"regexp"
	"strings"
)

// placeholderReceiptName matches the names the app gives a receipt before anything better is known: "Receipt"
// alone, or "Receipt" and a day ("Receipt 20 Oct 2026", "Receipt 2026-10-20", "Receipt 20/10/2026").
var placeholderReceiptName = regexp.MustCompile(
	`(?i)^receipt(\s+(\d{1,2}\s+[a-z]{3,9}\.?\s+\d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}))?$`,
)

// IsPlaceholderReceiptName reports whether a receipt still carries the default name, so a shop name read from
// the receipt may replace it. A name someone typed is never a placeholder.
func IsPlaceholderReceiptName(name string) bool {
	trimmed := strings.TrimSpace(name)
	return trimmed == "" || placeholderReceiptName.MatchString(trimmed)
}
