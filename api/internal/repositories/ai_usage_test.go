package repositories

import (
	"sync"
	"testing"
	"time"
)

func TestAiUsageAddsUpPerDayAndTotalsPerMonth(t *testing.T) {
	defer TruncateTestDb()
	repository := NewAiUsageRepository(nil)
	november := time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC)

	calls := []struct {
		at      time.Time
		aiType  string
		model   string
		in, out int64
	}{
		{november, "ANTHROPIC", "claude-opus-5-5", 1000, 200},
		{november.Add(time.Hour), "ANTHROPIC", "claude-opus-5-5", 500, 100},
		{november.AddDate(0, 0, 3), "ANTHROPIC", "claude-opus-5-5", 10, 5},
		{november, "OLLAMA", "llama", 900, 40},
		{november.AddDate(0, -1, 0), "ANTHROPIC", "claude-opus-5-5", 7, 3},
		{november.AddDate(0, -2, 0), "ANTHROPIC", "claude-opus-5-5", 99, 99},
	}
	for _, call := range calls {
		if err := repository.Record(call.at, call.aiType, call.model, call.in, call.out); err != nil {
			t.Fatal(err)
		}
	}

	var rows int64
	GetDB().Table("ai_usages").Count(&rows)
	if rows != 5 {
		t.Errorf("two calls on one day are one row: %d rows", rows)
	}

	months, err := repository.MonthsSince(november, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(months) != 3 {
		t.Fatalf("this month's two models and last month's one, not the month before: %+v", months)
	}
	first := months[0]
	if first.Month != "2026-11" || first.Model != "claude-opus-5-5" || first.Calls != 3 || first.InputTokens != 1510 || first.OutputTokens != 305 {
		t.Errorf("November for Claude: %+v", first)
	}
	if months[1].Model != "llama" || months[1].Calls != 1 || months[2].Month != "2026-10" || months[2].InputTokens != 7 {
		t.Errorf("order is newest month first, then provider and model: %+v", months)
	}
}

func TestAiUsageCountsCallsMadeAtTheSameMoment(t *testing.T) {
	defer TruncateTestDb()
	repository := NewAiUsageRepository(nil)
	now := time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC)

	var group sync.WaitGroup
	for i := 0; i < 20; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			if err := repository.Record(now, "GEMINI", "gemini-2.5-flash", 10, 1); err != nil {
				t.Error(err)
			}
		}()
	}
	group.Wait()

	months, err := repository.MonthsSince(now, 1)
	if err != nil || len(months) != 1 || months[0].Calls != 20 || months[0].InputTokens != 200 || months[0].OutputTokens != 20 {
		t.Errorf("twenty calls at once are twenty calls: %+v, %v", months, err)
	}
}
