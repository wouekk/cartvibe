package repositories

import (
	"strings"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"

	"github.com/shopspring/decimal"
	"testing"
)

// Helpers shared by the receipt ordering tests (the first-comment sort).

func createSortableReceipt(name string) models.Receipt {
	receipt := models.Receipt{
		Name:         name,
		Amount:       decimal.NewFromFloat(1),
		Date:         time.Now(),
		PaidByUserID: 1,
		Status:       models.OPEN,
		GroupId:      1,
	}
	GetDB().Create(&receipt)

	return receipt
}

func assertOrder(t *testing.T, got []string, want []string) {
	if len(got) != len(want) {
		utils.PrintTestError(t, got, want)
		return
	}

	for i := range want {
		if got[i] != want[i] {
			utils.PrintTestError(t, got, want)
			return
		}
	}
}

// normalizeSQL strips the identifier quoting each engine applies, so an assertion
// can name a column the way the code does rather than the way SQLite renders it.
func normalizeSQL(sql string) string {
	return strings.NewReplacer("`", "", `"`, "", "[", "", "]", "").Replace(sql)
}
