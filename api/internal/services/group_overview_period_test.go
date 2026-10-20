package services

import (
	"testing"
	"time"
)

func day(s string) time.Time {
	parsed, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return parsed
}

func TestPreviousPeriodOfWholeMonthsIsTheMonthsBefore(t *testing.T) {
	cases := []struct{ from, to, prevFrom, prevTo string }{
		{"2026-10-01", "2026-10-31", "2026-09-01", "2026-09-30"},
		{"2026-03-01", "2026-03-31", "2026-02-01", "2026-02-28"},
		{"2026-01-01", "2026-12-31", "2025-01-01", "2025-12-31"},
		{"2026-01-01", "2026-02-28", "2025-11-01", "2025-12-31"},
	}
	for _, c := range cases {
		previous := OverviewPeriod{From: day(c.from), To: day(c.to)}.Previous()
		if previous.From != day(c.prevFrom) || previous.To != day(c.prevTo) {
			t.Errorf("%s..%s: expected %s..%s, got %s..%s", c.from, c.to, c.prevFrom, c.prevTo,
				previous.From.Format(time.DateOnly), previous.To.Format(time.DateOnly))
		}
	}
}

func TestPreviousPeriodOfOtherRangesIsTheSameNumberOfDaysBefore(t *testing.T) {
	previous := OverviewPeriod{From: day("2026-10-12"), To: day("2026-10-18")}.Previous()
	if previous.From != day("2026-10-05") || previous.To != day("2026-10-11") {
		t.Errorf("a week should be compared with the week before, got %v..%v", previous.From, previous.To)
	}

	previous = OverviewPeriod{From: day("2026-10-05"), To: day("2026-11-03")}.Previous()
	if previous.To != day("2026-10-04") || previous.days() != 30 {
		t.Errorf("a 30-day range needs 30 days before it, got %v..%v", previous.From, previous.To)
	}
}

func TestResolveOverviewPeriod(t *testing.T) {
	now := day("2026-10-20")

	period, err := ResolveOverviewPeriod("2026-10", "", "", now)
	if err != nil || period.From != day("2026-10-01") || period.To != day("2026-10-31") {
		t.Errorf("a month should be its first to last day, got %+v %v", period, err)
	}

	period, err = ResolveOverviewPeriod("2026-10", "2026-01-05", "2026-02-10", now)
	if err != nil || period.From != day("2026-01-05") || period.To != day("2026-02-10") {
		t.Errorf("from/to should win over month, got %+v %v", period, err)
	}

	for _, bad := range [][2]string{{"2026-01-05", ""}, {"", "2026-01-05"}, {"x", "y"}, {"2026-02-10", "2026-01-05"}, {"2000-01-01", "2026-01-01"}} {
		if _, err := ResolveOverviewPeriod("", bad[0], bad[1], now); err != ErrInvalidOverviewPeriod {
			t.Errorf("%v should be refused, got %v", bad, err)
		}
	}

	if _, err := ResolveOverviewPeriod("nope", "", "", now); err != ErrInvalidOverviewMonth {
		t.Errorf("a bad month should be refused, got %v", err)
	}
}

func TestTrendIsDailyUnderAMonthAndMonthlyOtherwise(t *testing.T) {
	week := OverviewPeriod{From: day("2026-10-12"), To: day("2026-10-18")}
	overview := foldGroupOverview(nil, week, week.Previous())
	if overview.TrendUnit != TrendUnitDay || len(overview.Trend) != 7 || overview.Trend[0].Month != "2026-10-12" {
		t.Errorf("a week should be 7 days, got %s %d", overview.TrendUnit, len(overview.Trend))
	}
	if len(overview.Months) != 6 || overview.Months[5].Month != "2026-10" {
		t.Errorf("the month list should still be six months ending in October, got %+v", overview.Months)
	}

	year := OverviewPeriod{From: day("2025-01-01"), To: day("2025-12-31")}
	overview = foldGroupOverview(nil, year, year.Previous())
	if overview.TrendUnit != TrendUnitMonth || len(overview.Trend) != 12 || overview.Trend[0].Month != "2025-01" {
		t.Errorf("a year should be 12 months, got %s %d", overview.TrendUnit, len(overview.Trend))
	}

	month := OverviewPeriod{From: day("2026-10-01"), To: day("2026-10-31")}
	overview = foldGroupOverview(nil, month, month.Previous())
	if len(overview.Trend) != 6 || overview.Trend[5].Month != "2026-10" {
		t.Errorf("a month should keep the six-month trend, got %d", len(overview.Trend))
	}

	long := OverviewPeriod{From: day("2020-01-01"), To: day("2025-12-31")}
	overview = foldGroupOverview(nil, long, long.Previous())
	if len(overview.Trend) != groupOverviewMaxTrendMonths {
		t.Errorf("a long range should be capped at %d months, got %d", groupOverviewMaxTrendMonths, len(overview.Trend))
	}
}
