package repositories

import (
	"sort"
	"time"

	"cartvibe/api/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AiUsageRepository struct {
	BaseRepository
}

func NewAiUsageRepository(tx *gorm.DB) AiUsageRepository {
	return AiUsageRepository{BaseRepository: BaseRepository{DB: GetDB(), TX: tx}}
}

// Record adds one call and its tokens to the day's row for the model, creating the row on the day's first call.
// One statement, so two calls at the same moment both count.
func (repository AiUsageRepository) Record(at time.Time, aiType string, model string, inputTokens int64, outputTokens int64) error {
	usage := models.AiUsage{
		Day:          at.UTC().Format("2006-01-02"),
		AiType:       aiType,
		Model:        model,
		Calls:        1,
		InputTokens:  inputTokens,
		OutputTokens: outputTokens,
	}

	return repository.GetDB().Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "day"}, {Name: "ai_type"}, {Name: "model"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"calls":         gorm.Expr("calls + 1"),
			"input_tokens":  gorm.Expr("input_tokens + ?", inputTokens),
			"output_tokens": gorm.Expr("output_tokens + ?", outputTokens),
		}),
	}).Create(&usage).Error
}

// MonthsSince totals the usage per month and model from the first day of the month `months` back (1 is this month
// alone), newest month first, then by model. The sums are folded in Go like every other total.
func (repository AiUsageRepository) MonthsSince(now time.Time, months int) ([]models.AiUsageMonth, error) {
	if months < 1 {
		months = 1
	}
	now = now.UTC()
	from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, -(months - 1), 0)

	var days []models.AiUsage
	if err := repository.GetDB().Where("day >= ?", from.Format("2006-01-02")).Find(&days).Error; err != nil {
		return nil, err
	}

	totals := map[[3]string]*models.AiUsageMonth{}
	for _, day := range days {
		key := [3]string{day.Day[:7], day.AiType, day.Model}
		total, ok := totals[key]
		if !ok {
			total = &models.AiUsageMonth{Month: key[0], AiType: day.AiType, Model: day.Model}
			totals[key] = total
		}
		total.Calls += day.Calls
		total.InputTokens += day.InputTokens
		total.OutputTokens += day.OutputTokens
	}

	result := make([]models.AiUsageMonth, 0, len(totals))
	for _, total := range totals {
		result = append(result, *total)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Month != result[j].Month {
			return result[i].Month > result[j].Month
		}
		if result[i].AiType != result[j].AiType {
			return result[i].AiType < result[j].AiType
		}
		return result[i].Model < result[j].Model
	})

	return result, nil
}
