package repositories

import (
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"fmt"

	"gorm.io/gorm"
)

const moneyMinorUnitsMigration = "money-minor-units-v1"

// moneyColumn is one amount that moved from a decimal column to whole hundredths in an INTEGER column
// (models/money.go).
type moneyColumn struct {
	table   string
	decimal string
	minor   string
}

// moneyColumns are the four amounts the app stores. The decimal columns stay in every database made before
// 2026-11, as columns the app has stopped using do; a new install has none of them but receipts.amount, which
// the Receipt model still declares (its AmountDecimal field says why).
var moneyColumns = []moneyColumn{
	{table: "receipts", decimal: "amount", minor: "amount_minor"},
	{table: "receipts", decimal: "original_amount", minor: "original_amount_minor"},
	{table: "receipt_products", decimal: "amount", minor: "amount_minor"},
	{table: "user_prefernces", decimal: "monthly_spending_goal", minor: "monthly_spending_goal_minor"},
}

// runMoneyMinorUnitsMigration fills the new whole-hundredths columns from the decimal ones, once, for a database
// made before 2026-11. The schema migration has added the new columns by then: empty, or 0 for a receipt's amount.
//
// The conversion is ROUND(amount * 100). A decimal column is a floating-point number in SQLite, so 12.10 is read
// as 12.1 and times a hundred as 1210.0000000000002: rounding to the nearest whole number gives exactly 1210 for
// every amount that had two decimals, which is every amount the app ever accepted. An amount that somehow had
// more (written past the app) is rounded to hundredths, and how many there were is said in the log.
//
// It runs in the ledger's transaction: all four columns are filled or none, and a start that fails here stops
// and tries again, so the app never serves amounts that read as zero. The decimal columns are left as they were.
// Last, it makes the database keep receipts.amount in step from now on (ensureReceiptAmountMirror), which must
// not happen any earlier: before the fill, the new column still holds 0 for every receipt.
func runMoneyMinorUnitsMigration(tx *gorm.DB) error {
	converted, rounded := int64(0), int64(0)

	for _, column := range moneyColumns {
		// The schema migration adds the whole-hundredths column before any data migration runs. One that is not
		// there means this list names a table or a column wrongly, and going on would skip an amount in silence.
		if !tx.Migrator().HasColumn(column.table, column.minor) {
			return fmt.Errorf("%s.%s does not exist: the money columns are listed wrongly", column.table, column.minor)
		}
		// A new install never had the decimal column: nothing to fill.
		if !tx.Migrator().HasColumn(column.table, column.decimal) {
			continue
		}

		fill := tx.Exec(fmt.Sprintf(
			"UPDATE %s SET %s = CAST(ROUND(%s * 100) AS INTEGER) WHERE %s IS NOT NULL",
			column.table, column.minor, column.decimal, column.decimal))
		if fill.Error != nil {
			return fmt.Errorf("could not convert %s.%s to whole hundredths: %w", column.table, column.decimal, fill.Error)
		}
		converted += fill.RowsAffected

		// Proof, in the same transaction: every amount that was there is there, to the hundredth.
		var unconverted int64
		err := tx.Raw(fmt.Sprintf(
			"SELECT COUNT(*) FROM %s WHERE %s IS NOT NULL AND (%s IS NULL OR ABS(%s - %s / 100.0) > 0.005)",
			column.table, column.decimal, column.minor, column.decimal, column.minor)).Scan(&unconverted).Error
		if err != nil {
			return err
		}
		if unconverted > 0 {
			return fmt.Errorf("%d amount(s) in %s.%s did not convert to whole hundredths; nothing was changed",
				unconverted, column.table, column.decimal)
		}

		var moreThanTwoDecimals int64
		err = tx.Raw(fmt.Sprintf(
			"SELECT COUNT(*) FROM %s WHERE %s IS NOT NULL AND ABS(%s - %s / 100.0) > 0.0000001",
			column.table, column.decimal, column.decimal, column.minor)).Scan(&moreThanTwoDecimals).Error
		if err != nil {
			return err
		}
		rounded += moreThanTwoDecimals
	}

	if converted > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf(
			"amounts are stored as whole hundredths now: %d converted, %d of them had more than two decimals and were rounded",
			converted, rounded))
	}

	return ensureReceiptAmountMirror(tx)
}

// The two triggers that keep receipts.amount, the decimal column nothing reads any more, equal to
// receipts.amount_minor. The column is NOT NULL without a default in every database made before 2026-11, so an
// insert has to name it; rather than trust every write path to also put the right value there, the database does:
// after an insert, and after any update that touches amount_minor, whatever statement made it (a model, a map, a
// single-column update). A receipt's old column is then never a second, different amount, only the same one in
// the old shape.
const (
	receiptAmountMirrorOnInsert = `CREATE TRIGGER IF NOT EXISTS receipts_amount_mirror_insert
AFTER INSERT ON receipts
BEGIN
	UPDATE receipts SET amount = NEW.amount_minor / 100.0 WHERE id = NEW.id;
END`
	receiptAmountMirrorOnUpdate = `CREATE TRIGGER IF NOT EXISTS receipts_amount_mirror_update
AFTER UPDATE OF amount_minor ON receipts
BEGIN
	UPDATE receipts SET amount = NEW.amount_minor / 100.0 WHERE id = NEW.id;
END`
)

// ensureReceiptAmountMirror creates the two triggers when they are missing. It is called at the end of the fill
// above and again at every start after the data migrations (InitDB), so a database that lost them (a table that
// was rebuilt) gets them back. Never call it before the fill has run.
func ensureReceiptAmountMirror(target *gorm.DB) error {
	for _, trigger := range []string{receiptAmountMirrorOnInsert, receiptAmountMirrorOnUpdate} {
		if err := target.Exec(trigger).Error; err != nil {
			return fmt.Errorf("could not make the receipts.amount mirror: %w", err)
		}
	}
	return nil
}

// EnsureReceiptAmountMirror is ensureReceiptAmountMirror on the process database.
func EnsureReceiptAmountMirror() error {
	return ensureReceiptAmountMirror(GetDB())
}

// registerMoneyWriteGuard makes every update on this database pass models.RefuseWrongMoneyWrite first: a map or a
// single-column update that names an old decimal money column, or hands a decimal to a whole-hundredths one,
// fails with what to write instead. On the database, not on the models, so it holds for an update however its
// model is passed (by pointer, by value, or as a bare table name).
func registerMoneyWriteGuard(connected *gorm.DB) error {
	return connected.Callback().Update().Before("gorm:update").Register("cartvibe:money_write_guard", func(tx *gorm.DB) {
		if err := models.RefuseWrongMoneyWrite(tx.Statement.Table, tx.Statement.Dest); err != nil {
			_ = tx.AddError(err)
		}
	})
}
