package models

import (
	"encoding/json"
	"testing"

	"github.com/shopspring/decimal"
)

func TestToMinorUnits_IsTheAmountInWholeHundredths(t *testing.T) {
	for amount, want := range map[string]int64{
		"12.50":      1250,
		"12.5":       1250,
		"12.1":       1210,
		"92":         9200,
		"0":          0,
		"0.01":       1,
		"0.07":       7,
		"-3.05":      -305,
		"1234567.89": 123456789,
		// The amounts a floating-point number gets wrong when multiplied by a hundred.
		"0.57":  57,
		"1.15":  115,
		"8.2":   820,
		"19.99": 1999,
		// More places than are stored: rounded half away from zero.
		"1.005":  101,
		"1.004":  100,
		"-1.005": -101,
	} {
		if got := ToMinorUnits(decimal.RequireFromString(amount)); got != want {
			t.Errorf("ToMinorUnits(%s) = %d, want %d", amount, got, want)
		}
	}
}

// An amount leaves the API as the text it always had: no trailing zeros.
func TestFromMinorUnits_ReadsBackAsTheAmountWasAlwaysWritten(t *testing.T) {
	for minor, want := range map[int64]string{
		1250:      "12.5",
		1210:      "12.1",
		9200:      "92",
		1999:      "19.99",
		0:         "0",
		1:         "0.01",
		10:        "0.1",
		100:       "1",
		-305:      "-3.05",
		-500:      "-5",
		123456789: "1234567.89",
	} {
		amount := FromMinorUnits(minor)
		if amount.String() != want {
			t.Errorf("FromMinorUnits(%d) = %s, want %s", minor, amount.String(), want)
		}
		encoded, err := json.Marshal(amount)
		if err != nil || string(encoded) != `"`+want+`"` {
			t.Errorf("FromMinorUnits(%d) on the contract is %s, want %q", minor, encoded, want)
		}
		if back := ToMinorUnits(amount); back != minor {
			t.Errorf("%d did not survive the round trip: %d", minor, back)
		}
	}
}

func TestToMinorUnitsPtr_KeepsNoAmountAsNoAmount(t *testing.T) {
	if ToMinorUnitsPtr(nil) != nil {
		t.Error("no amount became an amount")
	}
	amount := decimal.RequireFromString("4.2")
	if got := ToMinorUnitsPtr(&amount); got == nil || *got != 420 {
		t.Errorf("got %v, want 420", got)
	}
}

func TestMinorFromColumn_TakesWholeNumbersOnly(t *testing.T) {
	for _, stored := range []interface{}{int64(1250), int(1250), int32(1250), float64(1250), []byte("1250"), "1250"} {
		got, err := minorFromColumn(stored)
		if err != nil || got != 1250 {
			t.Errorf("%T: got %d, %v", stored, got, err)
		}
	}
	// A fraction in the column would mean a decimal was written where hundredths belong: read as an error, never
	// as an amount a hundred times too small.
	for _, stored := range []interface{}{12.5, "12.5", []byte("12.50"), true} {
		if got, err := minorFromColumn(stored); err == nil {
			t.Errorf("%v (%T) was read as %d", stored, stored, got)
		}
	}
}
