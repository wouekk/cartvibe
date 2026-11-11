package models

import (
	"context"
	"fmt"
	"reflect"
	"strconv"

	"github.com/shopspring/decimal"
	"gorm.io/gorm/schema"
)

// Money is stored as a whole number of hundredths (1250 for 12.50), in an INTEGER column, since 2026-11. In Go it
// stays a decimal.Decimal and on the contract a string, so nothing above the database changed.
//
// Why: SQLite keeps a decimal(10,2) column as a floating-point number, so a sum, a comparison or a sort made in
// SQL was not exact, and every total had to be folded in Go. A whole number is exact wherever it is added,
// compared or sorted.
//
// The money columns are receipts.amount_minor and original_amount_minor, receipt_products.amount_minor and
// user_preferences.monthly_spending_goal_minor. A field becomes one with the tag `serializer:minor`. Hundredths
// whatever the currency: an amount was always kept with two decimals (the old columns were decimal(n,2), and the
// commands refuse a third), so a currency that counts in thousandths keeps two of its three places, as before.
//
// Not money, and unchanged: an exchange rate (six decimals) and a shopping list item's amount, which is a quantity
// ("1.5 kg").

// MoneyScale is the number of decimal places an amount is stored with.
const MoneyScale = 2

// ToMinorUnits is an amount as the whole number of hundredths that is stored: 12.50 becomes 1250. An amount with
// more places than MoneyScale is rounded half away from zero, the way decimal.Round does.
//
// A write that does not go through a model (a map passed to Updates, a single-column Update) must convert with
// this and name the *_minor column: GORM applies the serializer to model fields only.
func ToMinorUnits(amount decimal.Decimal) int64 {
	return amount.Shift(MoneyScale).Round(0).IntPart()
}

// ToMinorUnitsPtr is ToMinorUnits for an amount that may be absent: nil stays nil (NULL in the database).
func ToMinorUnitsPtr(amount *decimal.Decimal) *int64 {
	if amount == nil {
		return nil
	}
	minor := ToMinorUnits(*amount)
	return &minor
}

// FromMinorUnits is the amount a stored whole number of hundredths stands for: 1250 becomes 12.5, 9200 becomes 92.
//
// The decimal carries no trailing zeros, because that is how an amount has always left the API: a decimal is a
// string on the contract, and the old floating-point column gave "12.5" and "92", never "12.50" or "92.00". The
// value is the same either way; this keeps the text the same too, for every client that has ever read it.
func FromMinorUnits(minor int64) decimal.Decimal {
	exponent := int32(-MoneyScale)
	for exponent < 0 && minor%10 == 0 {
		minor /= 10
		exponent++
	}
	return decimal.New(minor, exponent)
}

// minorUnitsSerializer is the GORM serializer "minor": a decimal.Decimal or *decimal.Decimal field, an INTEGER
// column of hundredths.
type minorUnitsSerializer struct{}

func init() {
	schema.RegisterSerializer("minor", minorUnitsSerializer{})
}

// Scan reads the column into the field.
func (minorUnitsSerializer) Scan(ctx context.Context, field *schema.Field, dst reflect.Value, dbValue interface{}) error {
	target := field.ReflectValueOf(ctx, dst)
	pointer := field.FieldType.Kind() == reflect.Ptr

	if dbValue == nil {
		// NULL: no amount. A field that cannot be absent reads as zero.
		target.Set(reflect.Zero(field.FieldType))
		if !pointer {
			target.Set(reflect.ValueOf(decimal.Zero))
		}
		return nil
	}

	minor, err := minorFromColumn(dbValue)
	if err != nil {
		return fmt.Errorf("%s.%s: %w", field.Schema.Table, field.DBName, err)
	}

	amount := FromMinorUnits(minor)
	if pointer {
		target.Set(reflect.ValueOf(&amount))
	} else {
		target.Set(reflect.ValueOf(amount))
	}
	return nil
}

// Value turns the field into what is written to the column.
func (minorUnitsSerializer) Value(ctx context.Context, field *schema.Field, dst reflect.Value, fieldValue interface{}) (interface{}, error) {
	switch amount := fieldValue.(type) {
	case decimal.Decimal:
		return ToMinorUnits(amount), nil
	case *decimal.Decimal:
		if amount == nil {
			return nil, nil
		}
		return ToMinorUnits(*amount), nil
	case nil:
		return nil, nil
	default:
		return nil, fmt.Errorf("%s.%s: a money field must be a decimal, not %T", field.Schema.Table, field.DBName, fieldValue)
	}
}

// minorFromColumn reads what a driver hands back for an INTEGER column. SQLite gives an int64; the other shapes
// are accepted so a driver's choice never turns an amount into an error, but a number with a fraction is refused:
// it would mean a column that is not hundredths.
func minorFromColumn(dbValue interface{}) (int64, error) {
	switch value := dbValue.(type) {
	case int64:
		return value, nil
	case int:
		return int64(value), nil
	case int32:
		return int64(value), nil
	case float64:
		if value != float64(int64(value)) {
			return 0, fmt.Errorf("the stored amount %v is not a whole number of hundredths", value)
		}
		return int64(value), nil
	case []byte:
		return strconv.ParseInt(string(value), 10, 64)
	case string:
		return strconv.ParseInt(value, 10, 64)
	default:
		return 0, fmt.Errorf("the stored amount has an unexpected type %T", dbValue)
	}
}

// moneyColumnsOf names, for each table that holds money, the decimal columns that are not written any more and
// the keys under which whole hundredths are written (the column, and the model field's own name).
var moneyColumnsOf = map[string]struct{ decimal, minor []string }{
	"receipts": {
		decimal: []string{"amount", "original_amount"},
		minor:   []string{"amount_minor", "original_amount_minor", "Amount", "OriginalAmount"},
	},
	"receipt_products": {
		decimal: []string{"amount"},
		minor:   []string{"amount_minor", "Amount"},
	},
	"user_prefernces": {
		decimal: []string{"monthly_spending_goal"},
		minor:   []string{"monthly_spending_goal_minor", "MonthlySpendingGoal"},
	},
}

// RefuseWrongMoneyWrite checks an update before it runs (repositories registers it on the database, for every
// update). A write that goes through a model field is converted by the serializer; one that names a column itself
// (a map passed to Updates, a single-column Update) is not, and two mistakes would then pass in silence:
//   - naming the old decimal column ("amount"): on a receipt the write is dropped, because that column is the
//     database's to keep in step; elsewhere the column is gone;
//   - handing a decimal to the whole-hundredths column: 12.00 would be stored as 12 and read back as 0.12.
//
// Both are refused here, with what to write instead, so a mistake fails the statement (and the test that covers
// it) instead of showing a wrong amount. table is the statement's table and values what it writes; anything
// that is not a map of columns on one of the money tables passes.
func RefuseWrongMoneyWrite(table string, values interface{}) error {
	columns, holdsMoney := moneyColumnsOf[table]
	written, isMap := values.(map[string]interface{})
	if !holdsMoney || !isMap {
		return nil
	}

	for _, column := range columns.decimal {
		if _, named := written[column]; named {
			return fmt.Errorf("%s.%s is not written any more: write %s_minor with models.ToMinorUnits", table, column, column)
		}
	}
	for _, column := range columns.minor {
		value, named := written[column]
		if !named {
			continue
		}
		switch value.(type) {
		case nil, int64, *int64, int, int32:
		default:
			return fmt.Errorf("%s.%s holds whole hundredths: write models.ToMinorUnits(amount), not a %T", table, column, value)
		}
	}
	return nil
}
