package services

import (
	"bytes"
	"encoding/csv"
	"github.com/shopspring/decimal"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"testing"
	"time"
)

func TestShouldBuildReceiptCsv(t *testing.T) {
	// BuildReceiptCsv reads the app time zone from System Settings.
	defer repositories.TruncateTestDb()

	expected :=
		"Id,Added At,Receipt Date,Name,Paid By,Amount,Status,Categories,Tags,Resolved Date\n" +
			"1,2025-01-01,2025-01-01,test,Jim,123.45,OPEN,\"Groceries,Food\",\"Bill,Essential\",2025-01-01\n"

	date := time.Date(
		2025, 1, 1, 0, 0, 0, 0, time.UTC)
	service := NewReceiptCsvService()
	receipts := []models.Receipt{
		models.Receipt{
			BaseModel: models.BaseModel{
				ID:        1,
				CreatedAt: date,
			},
			Date:       date,
			Name:       "test",
			PaidByUser: models.User{DisplayName: "Jim"},
			Amount:     decimal.NewFromFloat(123.45),
			Status:     models.OPEN,
			Categories: []models.Category{
				models.Category{Name: "Groceries"},
				models.Category{Name: "Food"},
			},
			Tags: []models.Tag{
				models.Tag{Name: "Bill"},
				models.Tag{Name: "Essential"},
			},
			ResolvedDate: &date,
		},
	}

	result, err := service.BuildReceiptCsv(receipts)
	if err != nil {
		utils.PrintTestError(t, result, expected)
	}

	bytes := result.ReceiptCsvBytes
	if string(bytes) != expected {
		utils.PrintTestError(t, string(bytes), expected)
	}
}

// A receipt whose user-controlled text columns (name, paid-by display name,
// category/tag names) begin with a spreadsheet formula lead are neutralized with a
// leading apostrophe in the export, so opening it in Excel/Sheets renders them as
// literal text rather than executing them.
func TestBuildReceiptCsvNeutralizesFormulaInjection(t *testing.T) {
	// BuildReceiptCsv reads the app time zone from System Settings.
	defer repositories.TruncateTestDb()

	date := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	service := NewReceiptCsvService()
	receipts := []models.Receipt{
		{
			BaseModel:  models.BaseModel{ID: 1, CreatedAt: date},
			Date:       date,
			Name:       `=HYPERLINK("http://evil")`,
			PaidByUser: models.User{DisplayName: "+cmd"},
			Amount:     decimal.NewFromFloat(1),
			Status:     models.OPEN,
			Categories: []models.Category{{Name: "=SUM(A1)"}},
			Tags:       []models.Tag{{Name: "@danger"}},
		},
	}

	result, err := service.BuildReceiptCsv(receipts)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	records, err := csv.NewReader(bytes.NewReader(result.ReceiptCsvBytes)).ReadAll()
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if len(records) != 2 {
		utils.PrintTestError(t, len(records), 2)
		return
	}

	// Data row columns: Id, Added At, Receipt Date, Name, Paid By, Amount, Status,
	// Categories, Tags, Resolved Date.
	row := records[1]
	assertions := []struct {
		column int
		want   string
	}{
		{3, `'=HYPERLINK("http://evil")`}, // Name
		{4, "'+cmd"},                      // Paid By
		{7, "'=SUM(A1)"},                  // Categories
		{8, "'@danger"},                   // Tags
	}
	for _, assertion := range assertions {
		if row[assertion.column] != assertion.want {
			utils.PrintTestError(t, row[assertion.column], assertion.want)
		}
	}
}

func TestBuildReceiptCsvPrintsInstantsInTheAppZone(t *testing.T) {
	defer repositories.TruncateTestDb()

	if err := repositories.SetAppTimeZoneForTests("America/New_York"); err != nil {
		t.Fatal(err)
	}

	addedAt := time.Date(2026, 10, 1, 1, 0, 0, 0, time.UTC)  // Sep 30, 9PM in New York
	resolved := time.Date(2026, 11, 2, 3, 0, 0, 0, time.UTC) // Nov 1, 11PM in New York
	receipt := models.Receipt{
		BaseModel:    models.BaseModel{ID: 1, CreatedAt: addedAt},
		Date:         time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
		Name:         "late",
		Amount:       decimal.NewFromInt(1),
		Status:       models.OPEN,
		ResolvedDate: &resolved,
	}

	service := NewReceiptCsvService()
	result, err := service.BuildReceiptCsv([]models.Receipt{receipt})
	if err != nil {
		t.Fatal(err)
	}

	records, err := csv.NewReader(bytes.NewReader(result.ReceiptCsvBytes)).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	row := records[1]
	if row[1] != "2026-09-30" || row[2] != "2026-09-01" || row[9] != "2026-11-01" {
		t.Errorf("added/date/resolved = %s/%s/%s, want 2026-09-30/2026-09-01/2026-11-01", row[1], row[2], row[9])
	}
}
