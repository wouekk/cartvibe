package models

import (
	"cartvibe/api/internal/utils"
	"encoding/json"
	"github.com/shopspring/decimal"
	"net/http"
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
	Language string `gorm:"size:8" json:"language"`
	// OnboardingPending is true until the person has been through the first sign-in welcome (language, theme and, for
	// an admin, the household currency). New accounts start with it on; accounts from before it existed never see it.
	OnboardingPending bool `gorm:"not null;default:false" json:"onboardingPending"`
	// Region is the person's country, an ISO 3166-1 alpha-2 code ("PL"); "" means the desktop takes it from
	// the browser. It decides what the Automatic warranty period is.
	Region string `gorm:"size:2;not null;default:''" json:"region"`
	// WarrantyPeriodYears is where a new warranty date starts: receipt day plus this many years. Nil is
	// Automatic (by region); otherwise 1, 2, 3 or 5.
	WarrantyPeriodYears *int `json:"warrantyPeriodYears"`
	// WarrantyReminderLeadDays is how many days before a warranty ends the reminder comes; 0 is on the
	// day. Nil (an account from before the setting, or a client that does not send it) is 30.
	WarrantyReminderLeadDays *int           `json:"warrantyReminderLeadDays"`
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
