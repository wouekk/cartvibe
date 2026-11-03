package models

import "testing"

func TestResolveDateFormat(t *testing.T) {
	for _, format := range DateFormats {
		if got := ResolveDateFormat(format); got != format {
			t.Errorf("ResolveDateFormat(%q) = %q", format, got)
		}
	}

	for _, value := range []string{"", "dd/MM/yyyy", "D.M.YY"} {
		if got := ResolveDateFormat(value); got != DefaultDateFormat {
			t.Errorf("ResolveDateFormat(%q) = %q, want the default %q", value, got, DefaultDateFormat)
		}
	}
}
