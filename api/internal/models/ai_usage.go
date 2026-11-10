package models

// AiUsage is what one model was asked and what it wrote on one day: the calls and the tokens the provider counted
// (B5.7). One row per day, provider and model, added to on every call, so the table grows by a row a day per model
// in use and the AI page can total a month without reading every call.
//
// Day is a calendar day in UTC ("2006-01-02"): a month's total may be an evening off at its edges, which is fine
// for "what did the receipts cost this month".
type AiUsage struct {
	ID           uint   `gorm:"primarykey" json:"-"`
	Day          string `gorm:"not null;uniqueIndex:idx_ai_usage_day_model,priority:1" json:"day"`
	AiType       string `gorm:"not null;uniqueIndex:idx_ai_usage_day_model,priority:2" json:"aiType"`
	Model        string `gorm:"not null;uniqueIndex:idx_ai_usage_day_model,priority:3" json:"model"`
	Calls        int64  `gorm:"not null;default:0" json:"calls"`
	InputTokens  int64  `gorm:"not null;default:0" json:"inputTokens"`
	OutputTokens int64  `gorm:"not null;default:0" json:"outputTokens"`
}

// AiUsageMonth is a month's total for one model, as the AI page lists it.
type AiUsageMonth struct {
	// Month is "2006-01".
	Month        string `json:"month"`
	AiType       string `json:"aiType"`
	Model        string `json:"model"`
	Calls        int64  `json:"calls"`
	InputTokens  int64  `json:"inputTokens"`
	OutputTokens int64  `json:"outputTokens"`
}
