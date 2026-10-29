package services

import (
	"strings"
	"time"
)

// warrantyTwoYearRegions are where the Automatic warranty period is 2 years: the 27 EU member states, whose legal
// guarantee is at least 2 years (Directive (EU) 2019/771), and the outermost regions that report their own codes.
// Keep in step with the desktop's utils/warranty-period.ts.
var warrantyTwoYearRegions = map[string]bool{
	"AT": true, "BE": true, "BG": true, "HR": true, "CY": true, "CZ": true, "DK": true, "EE": true, "FI": true,
	"FR": true, "DE": true, "GR": true, "HU": true, "IE": true, "IT": true, "LV": true, "LT": true, "LU": true,
	"MT": true, "NL": true, "PL": true, "PT": true, "RO": true, "SK": true, "SI": true, "ES": true, "SE": true,
	"GP": true, "MQ": true, "GF": true, "RE": true, "YT": true, "MF": true, "IC": true, "EA": true,
}

// WarrantyPeriodChoices are the fixed periods a person can pick instead of Automatic.
var WarrantyPeriodChoices = []int{1, 2, 3, 5}

// DefaultWarrantyReminderLeadDays is the lead time of a person who never set one.
const DefaultWarrantyReminderLeadDays = 30

// AutomaticWarrantyYears is the Automatic period for a region: 2 years in the EU, 1 year in the US (the most
// common manufacturer warranty; there is no federal minimum) and anywhere else or unknown.
func AutomaticWarrantyYears(region string) int {
	if warrantyTwoYearRegions[strings.ToUpper(strings.TrimSpace(region))] {
		return 2
	}
	return 1
}

// IsWarrantyPeriodChoice reports whether years is one of the fixed periods.
func IsWarrantyPeriodChoice(years int) bool {
	for _, choice := range WarrantyPeriodChoices {
		if choice == years {
			return true
		}
	}
	return false
}

// AddWarrantyYears is day plus years*12 calendar months, kept inside the target month: 29 Feb + 1 year is 28 Feb
// (time.AddDate would roll it over to 1 Mar). day is a calendar day; the result is midnight UTC.
func AddWarrantyYears(day time.Time, years int) time.Time {
	year, month, date := day.Date()
	target := time.Date(year+years, month, 1, 0, 0, 0, 0, time.UTC)
	lastDay := target.AddDate(0, 1, -1).Day()
	if date > lastDay {
		date = lastDay
	}
	return time.Date(year+years, month, date, 0, 0, 0, 0, time.UTC)
}

// LeadDaysOrDefault is the stored lead time, 30 when none is stored, and never negative.
func LeadDaysOrDefault(leadDays *int) int {
	if leadDays == nil {
		return DefaultWarrantyReminderLeadDays
	}
	if *leadDays < 0 {
		return 0
	}
	return *leadDays
}

// WarrantyFireOn is the day a reminder comes: lead days before the warranty ends, or today when that is already
// past (a date entered too late to give the full warning). ok is false when the warranty ended before today,
// which gets no reminder. All three are calendar days "yyyy-MM-dd".
func WarrantyFireOn(warrantyUntil string, leadDays int, today string) (fireOn string, ok bool) {
	end, err := time.Parse(time.DateOnly, warrantyUntil)
	if err != nil || warrantyUntil < today {
		return "", false
	}
	if leadDays < 0 {
		leadDays = 0
	}
	fireOn = end.AddDate(0, 0, -leadDays).Format(time.DateOnly)
	if fireOn < today {
		fireOn = today
	}
	return fireOn, true
}
