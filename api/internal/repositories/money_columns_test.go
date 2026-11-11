package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func money(text string) decimal.Decimal { return decimal.RequireFromString(text) }

func moneyPtr(text string) *decimal.Decimal {
	amount := money(text)
	return &amount
}

// seedMoneyReceipt makes a receipt with the given amount in a household of its own.
func seedMoneyReceipt(t *testing.T, amount string, original *decimal.Decimal) models.Receipt {
	t.Helper()
	var user models.User
	if err := GetDB().First(&user).Error; err != nil {
		CreateTestUser()
		GetDB().First(&user)
	}
	var group models.Group
	if err := GetDB().First(&group).Error; err != nil {
		group = models.Group{Name: "Money"}
		if err := GetDB().Create(&group).Error; err != nil {
			t.Fatalf("seed group: %v", err)
		}
	}
	receipt := models.Receipt{Name: "r", GroupId: group.ID, PaidByUserID: user.ID, Amount: money(amount), OriginalAmount: original}
	if err := GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}
	return receipt
}

func storedInt(t *testing.T, query string, args ...interface{}) *int64 {
	t.Helper()
	var value *int64
	if err := GetDB().Raw(query, args...).Scan(&value).Error; err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return value
}

func TestMoney_AModelWritesWholeHundredthsAndReadsTheSameAmountBack(t *testing.T) {
	defer TruncateTestDb()
	receipt := seedMoneyReceipt(t, "12.10", moneyPtr("45.99"))

	if stored := storedInt(t, "SELECT amount_minor FROM receipts WHERE id = ?", receipt.ID); stored == nil || *stored != 1210 {
		t.Fatalf("amount_minor is %v, want 1210", stored)
	}
	if stored := storedInt(t, "SELECT original_amount_minor FROM receipts WHERE id = ?", receipt.ID); stored == nil || *stored != 4599 {
		t.Fatalf("original_amount_minor is %v, want 4599", stored)
	}

	var read models.Receipt
	if err := GetDB().First(&read, receipt.ID).Error; err != nil {
		t.Fatal(err)
	}
	if !read.Amount.Equal(money("12.1")) || read.Amount.String() != "12.1" {
		t.Errorf("amount read back as %s", read.Amount.String())
	}
	if read.OriginalAmount == nil || !read.OriginalAmount.Equal(money("45.99")) {
		t.Errorf("original amount read back as %v", read.OriginalAmount)
	}

	// A struct update goes through the same conversion.
	if err := GetDB().Model(&read).Updates(models.Receipt{Amount: money("7.05")}).Error; err != nil {
		t.Fatal(err)
	}
	if stored := storedInt(t, "SELECT amount_minor FROM receipts WHERE id = ?", receipt.ID); stored == nil || *stored != 705 {
		t.Fatalf("after an update amount_minor is %v, want 705", stored)
	}
}

func TestMoney_NoAmountIsNullNotZero(t *testing.T) {
	defer TruncateTestDb()
	receipt := seedMoneyReceipt(t, "5", nil)
	withoutAmount := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "no price printed"}
	priced := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "milk", Amount: moneyPtr("1.09")}
	if err := GetDB().Create(&withoutAmount).Error; err != nil {
		t.Fatal(err)
	}
	if err := GetDB().Create(&priced).Error; err != nil {
		t.Fatal(err)
	}

	if stored := storedInt(t, "SELECT amount_minor FROM receipt_products WHERE id = ?", withoutAmount.ID); stored != nil {
		t.Errorf("a line without an amount stored %d", *stored)
	}
	if stored := storedInt(t, "SELECT original_amount_minor FROM receipts WHERE id = ?", receipt.ID); stored != nil {
		t.Errorf("a receipt without an original amount stored %d", *stored)
	}

	var read []models.ReceiptProduct
	if err := GetDB().Order("id").Find(&read, "receipt_id = ?", receipt.ID).Error; err != nil {
		t.Fatal(err)
	}
	if read[0].Amount != nil {
		t.Errorf("no amount read back as %s", read[0].Amount)
	}
	if read[1].Amount == nil || read[1].Amount.String() != "1.09" {
		t.Errorf("1.09 read back as %v", read[1].Amount)
	}
}

func TestMoney_TheMonthlyGoalIsStoredTheSameWay(t *testing.T) {
	defer TruncateTestDb()
	CreateTestUser()
	preferences := models.UserPreferences{UserId: 1, MonthlySpendingGoal: moneyPtr("1500.50")}
	if err := GetDB().Create(&preferences).Error; err != nil {
		t.Fatal(err)
	}

	if stored := storedInt(t, "SELECT monthly_spending_goal_minor FROM user_prefernces WHERE id = ?", preferences.ID); stored == nil || *stored != 150050 {
		t.Fatalf("the goal is stored as %v, want 150050", stored)
	}
	var read models.UserPreferences
	GetDB().First(&read, preferences.ID)
	if read.MonthlySpendingGoal == nil || read.MonthlySpendingGoal.String() != "1500.5" {
		t.Errorf("the goal read back as %v", read.MonthlySpendingGoal)
	}
}

// What the change is for: a sum, a comparison and a sort made in SQL are exact.
func TestMoney_SqlAddsComparesAndSortsExactly(t *testing.T) {
	defer TruncateTestDb()
	for _, amount := range []string{"0.10", "0.20", "0.30", "19.99", "0.57"} {
		seedMoneyReceipt(t, amount, nil)
	}

	// 0.1 + 0.2 is not 0.3 in floating point; in hundredths 10 + 20 is 30.
	if sum := storedInt(t, "SELECT SUM(amount_minor) FROM receipts WHERE amount_minor IN (10, 20)"); sum == nil || *sum != 30 {
		t.Errorf("0.10 + 0.20 = %v hundredths, want 30", sum)
	}
	if sum := storedInt(t, "SELECT SUM(amount_minor) FROM receipts"); sum == nil || *sum != 2116 {
		t.Errorf("the total is %v hundredths, want 2116", sum)
	}

	equals, ok := amountFilterInMinorUnits(0.3, commands.EQUALS)
	if !ok || equals.(int64) != 30 {
		t.Fatalf("the filter value for 0.3 is %v", equals)
	}
	var found int64
	GetDB().Model(&models.Receipt{}).Where("amount_minor = ?", equals).Count(&found)
	if found != 1 {
		t.Errorf("\"equals 0.3\" found %d receipts, want 1", found)
	}

	var sorted []models.Receipt
	GetDB().Order("amount_minor DESC").Find(&sorted)
	if sorted[0].Amount.String() != "19.99" || sorted[len(sorted)-1].Amount.String() != "0.1" {
		t.Errorf("sorted from %s to %s", sorted[0].Amount, sorted[len(sorted)-1].Amount)
	}
}

func TestAmountFilterInMinorUnits(t *testing.T) {
	if value, ok := amountFilterInMinorUnits(12.1, commands.GREATER_THAN); !ok || value.(int64) != 1210 {
		t.Errorf("12.1 became %v", value)
	}
	if value, ok := amountFilterInMinorUnits(0.57, commands.EQUALS); !ok || value.(int64) != 57 {
		t.Errorf("0.57 became %v", value)
	}
	between, ok := amountFilterInMinorUnits([]interface{}{0.1, 19.99}, commands.BETWEEN)
	if !ok || between.([]interface{})[0].(int64) != 10 || between.([]interface{})[1].(int64) != 1999 {
		t.Errorf("between 0.1 and 19.99 became %v", between)
	}

	// A body that is not what the operation takes adds no condition, and never panics.
	for _, malformed := range []struct {
		value     interface{}
		operation commands.FilterOperation
	}{
		{nil, commands.EQUALS},
		{"12.10", commands.EQUALS},
		{[]interface{}{1.0}, commands.BETWEEN},
		{[]interface{}{1.0, "2"}, commands.BETWEEN},
		{5.0, commands.BETWEEN},
		{map[string]interface{}{"a": 1}, commands.GREATER_THAN},
	} {
		if value, ok := amountFilterInMinorUnits(malformed.value, malformed.operation); ok {
			t.Errorf("%v with %s gave a condition: %v", malformed.value, malformed.operation, value)
		}
	}
}

func storedDecimal(t *testing.T, id uint) float64 {
	t.Helper()
	var value float64
	if err := GetDB().Raw("SELECT amount FROM receipts WHERE id = ?", id).Scan(&value).Error; err != nil {
		t.Fatal(err)
	}
	return value
}

// The old column cannot be left out of an insert (it is NOT NULL in every database made before), so the database
// keeps it equal to the new one, whatever statement wrote the amount.
func TestMoney_TheDatabaseKeepsTheOldReceiptColumnInStep(t *testing.T) {
	defer TruncateTestDb()
	if err := EnsureReceiptAmountMirror(); err != nil {
		t.Fatal(err)
	}
	// Twice is as good as once.
	if err := EnsureReceiptAmountMirror(); err != nil {
		t.Fatal(err)
	}

	receipt := seedMoneyReceipt(t, "12.10", nil)
	if got := storedDecimal(t, receipt.ID); got != 12.1 {
		t.Errorf("after an insert the old column holds %v, want 12.1", got)
	}

	if err := GetDB().Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("amount_minor", int64(999)).Error; err != nil {
		t.Fatal(err)
	}
	if got := storedDecimal(t, receipt.ID); got != 9.99 {
		t.Errorf("after a single-column update the old column holds %v, want 9.99", got)
	}

	if err := GetDB().Model(&receipt).Updates(models.Receipt{Amount: money("3.5")}).Error; err != nil {
		t.Fatal(err)
	}
	if got := storedDecimal(t, receipt.ID); got != 3.5 {
		t.Errorf("after a struct update the old column holds %v, want 3.5", got)
	}

	receipt.Amount = money("0.07")
	receipt.Name = "saved whole"
	if err := GetDB().Save(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	if got := storedDecimal(t, receipt.ID); got != 0.07 {
		t.Errorf("after a whole save the old column holds %v, want 0.07", got)
	}

	// An update that does not touch the amount leaves both alone.
	if err := GetDB().Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("name", "renamed").Error; err != nil {
		t.Fatal(err)
	}
	if got := storedDecimal(t, receipt.ID); got != 0.07 {
		t.Errorf("an unrelated update changed the old column to %v", got)
	}
}

// A map or a single-column update is not converted by the model, so the two ways to get it wrong are refused.
func TestMoney_AWriteThatNamesAColumnWronglyIsRefused(t *testing.T) {
	defer TruncateTestDb()
	receipt := seedMoneyReceipt(t, "12.10", nil)
	product := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "milk", Amount: moneyPtr("1.09")}
	GetDB().Create(&product)
	preferences := models.UserPreferences{UserId: receipt.PaidByUserID}
	GetDB().Create(&preferences)

	for name, write := range map[string]func() error{
		"the old receipt column": func() error {
			return GetDB().Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("amount", "99.00").Error
		},
		"the old original amount column": func() error {
			return GetDB().Model(&models.Receipt{}).Where("id = ?", receipt.ID).Updates(map[string]any{"original_amount": money("5")}).Error
		},
		"a decimal into the receipt's hundredths": func() error {
			return GetDB().Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("amount_minor", money("99.00")).Error
		},
		"a decimal under the field's name": func() error {
			return GetDB().Model(&models.Receipt{}).Where("id = ?", receipt.ID).Updates(map[string]any{"Amount": money("99.00")}).Error
		},
		"the old product column": func() error {
			return GetDB().Model(&models.ReceiptProduct{}).Where("id = ?", product.ID).Updates(map[string]any{"amount": moneyPtr("2")}).Error
		},
		"a decimal into a product's hundredths": func() error {
			return GetDB().Model(&models.ReceiptProduct{}).Where("id = ?", product.ID).Updates(map[string]any{"amount_minor": moneyPtr("2")}).Error
		},
		"the old goal column": func() error {
			return GetDB().Model(&models.UserPreferences{}).Where("id = ?", preferences.ID).Updates(map[string]any{"monthly_spending_goal": moneyPtr("100")}).Error
		},
		"a float into the goal's hundredths": func() error {
			return GetDB().Model(&models.UserPreferences{}).Where("id = ?", preferences.ID).Update("monthly_spending_goal_minor", 100.5).Error
		},
	} {
		err := write()
		if err == nil {
			t.Errorf("%s: the write was accepted", name)
			continue
		}
		if !strings.Contains(err.Error(), "ToMinorUnits") {
			t.Errorf("%s: the refusal does not say what to write instead: %v", name, err)
		}
	}

	// Nothing was changed by the refused writes.
	if stored := storedInt(t, "SELECT amount_minor FROM receipts WHERE id = ?", receipt.ID); stored == nil || *stored != 1210 {
		t.Errorf("a refused write changed the amount to %v", stored)
	}

	// The right way is taken: whole hundredths, or nothing at all.
	for name, write := range map[string]func() error{
		"hundredths into a receipt": func() error {
			return GetDB().Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("amount_minor", models.ToMinorUnits(money("99.00"))).Error
		},
		"hundredths or nothing into a product": func() error {
			return GetDB().Model(&models.ReceiptProduct{}).Where("id = ?", product.ID).Updates(map[string]any{"amount_minor": models.ToMinorUnitsPtr(nil), "name": "no price"}).Error
		},
		"hundredths into the goal": func() error {
			return GetDB().Model(&models.UserPreferences{}).Where("id = ?", preferences.ID).Updates(map[string]any{"monthly_spending_goal_minor": models.ToMinorUnitsPtr(moneyPtr("100"))}).Error
		},
	} {
		if err := write(); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	if stored := storedInt(t, "SELECT amount_minor FROM receipts WHERE id = ?", receipt.ID); stored == nil || *stored != 9900 {
		t.Errorf("the amount is %v, want 9900", stored)
	}
	if stored := storedInt(t, "SELECT amount_minor FROM receipt_products WHERE id = ?", product.ID); stored != nil {
		t.Errorf("the product's amount was not cleared: %d", *stored)
	}
}

// withOldMoneyColumns gives the test database the decimal columns a database from before 2026-11 has (a new one
// only has receipts.amount), and removes the mirror so the test can put old values in.
func withOldMoneyColumns(t *testing.T) {
	t.Helper()
	for _, column := range []struct{ table, name, kind string }{
		{"receipts", "original_amount", "decimal(14,2)"},
		{"receipt_products", "amount", "decimal(10,2)"},
		{"user_prefernces", "monthly_spending_goal", "decimal(12,2)"},
	} {
		if !GetDB().Migrator().HasColumn(column.table, column.name) {
			if err := GetDB().Exec("ALTER TABLE " + column.table + " ADD COLUMN " + column.name + " " + column.kind).Error; err != nil {
				t.Fatalf("add %s.%s: %v", column.table, column.name, err)
			}
		}
	}
	GetDB().Exec("DROP TRIGGER IF EXISTS receipts_amount_mirror_insert")
	GetDB().Exec("DROP TRIGGER IF EXISTS receipts_amount_mirror_update")
	t.Cleanup(func() {
		// The decimal columns are emptied, so a later test never finds an old value in them.
		GetDB().Exec("UPDATE receipts SET original_amount = NULL")
		GetDB().Exec("UPDATE receipt_products SET amount = NULL")
		GetDB().Exec("UPDATE user_prefernces SET monthly_spending_goal = NULL")
	})
}

func TestMoneyMinorUnitsMigration_FillsEveryAmountToTheHundredth(t *testing.T) {
	defer TruncateTestDb()
	withOldMoneyColumns(t)

	// What an old database holds: decimals, and the new columns as the schema migration just added them.
	old := map[string]int64{
		"12.10": 1210, "0.07": 7, "1234567.89": 123456789, "-5.5": -550, "0": 0, "92": 9200,
		// The amounts floating point gets wrong when multiplied by a hundred.
		"0.57": 57, "1.15": 115, "8.2": 820, "19.99": 1999, "4.35": 435, "1.1": 110,
	}
	ids := map[string]uint{}
	for amount := range old {
		receipt := seedMoneyReceipt(t, "0", nil)
		ids[amount] = receipt.ID
		if err := GetDB().Exec("UPDATE receipts SET amount = "+amount+", original_amount = "+amount+", amount_minor = 0, original_amount_minor = NULL WHERE id = ?", receipt.ID).Error; err != nil {
			t.Fatal(err)
		}
	}
	withoutOriginal := seedMoneyReceipt(t, "0", nil)
	GetDB().Exec("UPDATE receipts SET amount = 3.3, amount_minor = 0 WHERE id = ?", withoutOriginal.ID)

	priced := models.ReceiptProduct{ReceiptId: withoutOriginal.ID, Name: "milk"}
	unpriced := models.ReceiptProduct{ReceiptId: withoutOriginal.ID, Name: "no price"}
	GetDB().Create(&priced)
	GetDB().Create(&unpriced)
	GetDB().Exec("UPDATE receipt_products SET amount = 1.09 WHERE id = ?", priced.ID)

	preferences := models.UserPreferences{UserId: withoutOriginal.PaidByUserID}
	GetDB().Create(&preferences)
	GetDB().Exec("UPDATE user_prefernces SET monthly_spending_goal = 1500.5 WHERE id = ?", preferences.ID)

	if err := runMoneyMinorUnitsMigration(GetDB()); err != nil {
		t.Fatalf("migration: %v", err)
	}

	for amount, want := range old {
		if stored := storedInt(t, "SELECT amount_minor FROM receipts WHERE id = ?", ids[amount]); stored == nil || *stored != want {
			t.Errorf("%s became %v hundredths, want %d", amount, stored, want)
		}
		if stored := storedInt(t, "SELECT original_amount_minor FROM receipts WHERE id = ?", ids[amount]); stored == nil || *stored != want {
			t.Errorf("original %s became %v hundredths, want %d", amount, stored, want)
		}
	}
	if stored := storedInt(t, "SELECT original_amount_minor FROM receipts WHERE id = ?", withoutOriginal.ID); stored != nil {
		t.Errorf("a receipt without an original amount got %d", *stored)
	}
	if stored := storedInt(t, "SELECT amount_minor FROM receipt_products WHERE id = ?", priced.ID); stored == nil || *stored != 109 {
		t.Errorf("the product's 1.09 became %v", stored)
	}
	if stored := storedInt(t, "SELECT amount_minor FROM receipt_products WHERE id = ?", unpriced.ID); stored != nil {
		t.Errorf("a line without an amount got %d", *stored)
	}
	if stored := storedInt(t, "SELECT monthly_spending_goal_minor FROM user_prefernces WHERE id = ?", preferences.ID); stored == nil || *stored != 150050 {
		t.Errorf("the goal 1500.5 became %v", stored)
	}

	// The models read what was there before, to the hundredth.
	var read models.Receipt
	GetDB().First(&read, ids["1234567.89"])
	if read.Amount.String() != "1234567.89" || read.OriginalAmount == nil || read.OriginalAmount.String() != "1234567.89" {
		t.Errorf("read back %s and %v", read.Amount, read.OriginalAmount)
	}

	// From here on the database keeps the old receipt column in step.
	var triggers int64
	GetDB().Raw("SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'receipts_amount_mirror_%'").Scan(&triggers)
	if triggers != 2 {
		t.Errorf("%d mirror triggers after the migration, want 2", triggers)
	}
	// And the old values were left as they were.
	if got := storedDecimal(t, ids["12.10"]); got != 12.1 {
		t.Errorf("the old column holds %v after the migration, want 12.1", got)
	}
}

func TestMoneyMinorUnitsMigration_RoundsAnAmountWithMoreThanTwoDecimals(t *testing.T) {
	defer TruncateTestDb()
	withOldMoneyColumns(t)
	receipt := seedMoneyReceipt(t, "0", nil)
	GetDB().Exec("UPDATE receipts SET amount = 19.999, amount_minor = 0 WHERE id = ?", receipt.ID)

	if err := runMoneyMinorUnitsMigration(GetDB()); err != nil {
		t.Fatalf("an amount with three decimals stopped the migration: %v", err)
	}

	if stored := storedInt(t, "SELECT amount_minor FROM receipts WHERE id = ?", receipt.ID); stored == nil || *stored != 2000 {
		t.Errorf("19.999 became %v hundredths, want 2000", stored)
	}
}

func TestMoneyMinorUnitsMigration_ANewInstallHasNothingToFill(t *testing.T) {
	defer TruncateTestDb()

	if err := runMoneyMinorUnitsMigration(GetDB()); err != nil {
		t.Fatalf("an empty database failed: %v", err)
	}
}

// The list the migration fills and the list the guard watches are two; a money column must be in both.
func TestMoney_EveryMoneyColumnIsGuarded(t *testing.T) {
	for _, column := range moneyColumns {
		if err := models.RefuseWrongMoneyWrite(column.table, map[string]interface{}{column.decimal: 1}); err == nil {
			t.Errorf("%s.%s: a write to the old column is not refused", column.table, column.decimal)
		}
		if err := models.RefuseWrongMoneyWrite(column.table, map[string]interface{}{column.minor: money("1.5")}); err == nil {
			t.Errorf("%s.%s: a decimal is not refused", column.table, column.minor)
		}
		if err := models.RefuseWrongMoneyWrite(column.table, map[string]interface{}{column.minor: int64(150)}); err != nil {
			t.Errorf("%s.%s: whole hundredths are refused: %v", column.table, column.minor, err)
		}
		if !GetDB().Migrator().HasColumn(column.table, column.minor) {
			t.Errorf("%s.%s does not exist", column.table, column.minor)
		}
	}
	// Another table, or a write that is not a map of columns, is none of the guard's business.
	if err := models.RefuseWrongMoneyWrite("shopping_list_items", map[string]interface{}{"amount": money("1.5")}); err != nil {
		t.Errorf("a shopping list item's quantity was taken for money: %v", err)
	}
	if err := models.RefuseWrongMoneyWrite("receipts", models.Receipt{Amount: money("1.5")}); err != nil {
		t.Errorf("a model was refused: %v", err)
	}
}
