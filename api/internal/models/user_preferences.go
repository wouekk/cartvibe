package models

import (
	"encoding/json"
	"github.com/shopspring/decimal"
	"net/http"
	"cartvibe/api/internal/utils"
)

type UserPrefernces struct {
	BaseModel
	UserId                   uint          `gorm:"not null; uniqueIndex" json:"userId"`
	User                     *User         `json:"-"`
	QuickScanDefaultGroupId  *uint         `json:"quickScanDefaultGroupId"`
	QuickScanDefaultGroup    *Group        `json:"-"`
	QuickScanDefaultPaidById *uint         `json:"quickScanDefaultPaidById"`
	QuickScanDefaultPaidBy   *User         `json:"-"`
	QuickScanDefaultStatus   ReceiptStatus `json:"quickScanDefaultStatus"`
	CloseChipSelectOnSelect  bool          `json:"closeChipSelectOnSelect"`
	// MonthlySpendingGoal is the most this person wants to spend in a month; nil or zero means no goal.
	MonthlySpendingGoal *decimal.Decimal `gorm:"type:decimal(12,2)" json:"monthlySpendingGoal"`
	// DisplayCurrency is the ISO code this person sees the Dashboard figures in ("" means the household currency), and
	// DisplayCurrencyRate how many of it one unit of the household currency is worth. Only the Dashboard converts; stored
	// amounts and every other screen stay in the household currency.
	DisplayCurrency     string           `gorm:"size:8" json:"displayCurrency"`
	DisplayCurrencyRate *decimal.Decimal `gorm:"type:decimal(18,6)" json:"displayCurrencyRate"`
	// Language is the interface language this person chose ("en", "pl", ...; any code the desktop knows); "" follows the browser. A plain string so a new
	// language is never a new value in a closed enum.
	Language      string         `gorm:"size:8" json:"language"`
	UserShortcuts []UserShortcut `json:"userShortcuts"`
}

func (userPreferences *UserPrefernces) LoadDataFromRequest(w http.ResponseWriter, r *http.Request) error {
	bytes, err := utils.GetBodyData(w, r)
	if err != nil {
		return err
	}

	err = json.Unmarshal(bytes, &userPreferences)
	if err != nil {
		return err
	}

	return nil
}
