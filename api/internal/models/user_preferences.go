package models

import (
	"encoding/json"
	"github.com/shopspring/decimal"
	"net/http"
	"receipt-wrangler/api/internal/utils"
)

type UserPrefernces struct {
	BaseModel
	UserId                   uint           `gorm:"not null; uniqueIndex" json:"userId"`
	User                     *User          `json:"-"`
	QuickScanDefaultGroupId  *uint          `json:"quickScanDefaultGroupId"`
	QuickScanDefaultGroup    *Group         `json:"-"`
	QuickScanDefaultPaidById *uint          `json:"quickScanDefaultPaidById"`
	QuickScanDefaultPaidBy   *User          `json:"-"`
	QuickScanDefaultStatus   ReceiptStatus  `json:"quickScanDefaultStatus"`
	CloseChipSelectOnSelect  bool           `json:"closeChipSelectOnSelect"`
	// MonthlySpendingGoal is the most this person wants to spend in a month; nil or zero means no goal.
	MonthlySpendingGoal *decimal.Decimal `gorm:"type:decimal(12,2)" json:"monthlySpendingGoal"`
	UserShortcuts            []UserShortcut `json:"userShortcuts"`
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
