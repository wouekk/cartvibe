package services

import "testing"

func TestIsPlaceholderReceiptName(t *testing.T) {
	for _, name := range []string{"", "  ", "Receipt", "receipt", "Receipt 20 Oct 2026", "Receipt 5 September 2026", "Receipt 2026-10-20", "Receipt 20/10/2026", "Receipt 20.10.26"} {
		if !IsPlaceholderReceiptName(name) {
			t.Errorf("%q should count as a placeholder", name)
		}
	}

	for _, name := range []string{"Auchan", "Weekly shop", "Receipt for the party", "My receipt", "Receipt 20 Oct 2026 Lidl", "Edeka"} {
		if IsPlaceholderReceiptName(name) {
			t.Errorf("%q was typed by a person and should be kept", name)
		}
	}
}
