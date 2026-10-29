package services

import (
	"testing"
	"time"
)

func TestAutomaticWarrantyYears(t *testing.T) {
	for region, want := range map[string]int{
		"PL": 2, "de": 2, " SE ": 2, "GP": 2, "IC": 2, "EA": 2, "RE": 2,
		"US": 1, "GB": 1, "CH": 1, "NO": 1, "": 1, "XX": 1,
	} {
		if got := AutomaticWarrantyYears(region); got != want {
			t.Errorf("region %q: expected %d years, got %d", region, want, got)
		}
	}
}

func TestAddWarrantyYears(t *testing.T) {
	day := func(s string) time.Time {
		parsed, _ := time.Parse(time.DateOnly, s)
		return parsed
	}
	cases := []struct {
		from  string
		years int
		want  string
	}{
		{"2026-10-29", 2, "2028-10-29"},
		{"2024-02-29", 1, "2025-02-28"},
		{"2024-02-29", 4, "2028-02-29"},
		{"2026-01-31", 1, "2027-01-31"},
		{"2026-12-31", 5, "2031-12-31"},
	}
	for _, c := range cases {
		if got := AddWarrantyYears(day(c.from), c.years).Format(time.DateOnly); got != c.want {
			t.Errorf("%s + %d years: expected %s, got %s", c.from, c.years, c.want, got)
		}
	}
}

func TestWarrantyFireOn(t *testing.T) {
	cases := []struct {
		name, until string
		lead        int
		today       string
		want        string
		ok          bool
	}{
		{"lead time before the end", "2027-03-12", 30, "2026-10-29", "2027-02-10", true},
		{"zero lead fires on the day", "2027-03-12", 0, "2026-10-29", "2027-03-12", true},
		{"entered too late fires today", "2026-11-05", 30, "2026-10-29", "2026-10-29", true},
		{"ends today fires today", "2026-10-29", 30, "2026-10-29", "2026-10-29", true},
		{"already ended gets none", "2026-10-28", 30, "2026-10-29", "", false},
		{"a negative lead is on the day", "2027-03-12", -3, "2026-10-29", "2027-03-12", true},
	}
	for _, c := range cases {
		got, ok := WarrantyFireOn(c.until, c.lead, c.today)
		if got != c.want || ok != c.ok {
			t.Errorf("%s: expected (%q, %v), got (%q, %v)", c.name, c.want, c.ok, got, ok)
		}
	}
}

func TestLeadDaysOrDefault(t *testing.T) {
	zero, negative, ten := 0, -1, 10
	if LeadDaysOrDefault(nil) != 30 || LeadDaysOrDefault(&zero) != 0 || LeadDaysOrDefault(&negative) != 0 || LeadDaysOrDefault(&ten) != 10 {
		t.Fatal("unexpected lead days")
	}
}
