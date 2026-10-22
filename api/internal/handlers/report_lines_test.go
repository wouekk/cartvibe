package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
)

// linesReportBody aggregates group 1's receipts by category, which reports read
// off the receipts' product lines.
const linesReportBody = `{
  "name": "Lines Report",
  "groupIds": ["1"],
  "period": {"preset": "custom", "startDate": "2026-05-01", "endDate": "2026-05-31"},
  "detail": {"mode": "aggregate", "by": "category"},
  "columns": [
    {"kind": "dimension", "name": "Category", "label": "Category", "field": "category"},
    {"kind": "aggregate", "name": "Total", "label": "Total", "aggFunc": "SUM", "measure": "amount"}
  ],
  "grandTotals": true,
  "formats": ["csv"]
}`

// seedLinesReceipt stores a 100.00 receipt in group 1 with a 60.00 Food line and
// a 40.00 Fuel line. It also carries an old receipt-level category, which a
// report must not read.
func seedLinesReceipt(t *testing.T) {
	t.Helper()
	db := repositories.GetDB()
	categories := []models.Category{{Name: "Food"}, {Name: "Fuel"}, {Name: "Receipt Level"}}
	for index := range categories {
		if err := db.Create(&categories[index]).Error; err != nil {
			t.Fatalf("seed category: %v", err)
		}
	}
	receipt := models.Receipt{
		Name:         "shared",
		Amount:       decimal.NewFromInt(100),
		Date:         time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC),
		GroupId:      1,
		PaidByUserID: 1,
		Status:       models.OPEN,
		Categories:   []models.Category{categories[2]},
	}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}
	for index, amount := range []int64{60, 40} {
		value := decimal.NewFromInt(amount)
		categoryId := categories[index].ID
		line := models.ReceiptProduct{ReceiptId: receipt.ID, Name: categories[index].Name, Amount: &value, CategoryId: &categoryId}
		if err := db.Create(&line).Error; err != nil {
			t.Fatalf("seed line: %v", err)
		}
	}
}

func TestPreviewReport_CategoriesComeFromTheLines(t *testing.T) {
	defer tearDownReportTest()
	repositories.CreateTestGroupWithUsers()
	grantAppPerms(t, 1, permissions.AppReportsRead)
	grantGroupPerms(t, 1, 1, permissions.GroupReportsRead)
	seedLinesReceipt(t)

	w, r := generateReportRequest(1, linesReportBody)
	PreviewReport(w, r)

	assertStatus(t, w, http.StatusOK)
	preview := decodePreview(t, w.Body.Bytes())
	if preview.ReceiptCount != 1 {
		t.Errorf("receiptCount = %d, want 1 receipt, not one per category", preview.ReceiptCount)
	}
	for _, want := range []string{"Food", "60.00", "Fuel", "40.00", "100.00"} {
		if !strings.Contains(preview.Html, want) {
			t.Errorf("preview is missing %q:\n%s", want, preview.Html)
		}
	}
	if strings.Contains(preview.Html, "Receipt Level") {
		t.Errorf("the receipt-level category leaked into the report:\n%s", preview.Html)
	}
}

// A template saved while the equal split existed still loads and generates; the
// retired keys are ignored and the report reads the lines.
func TestGenerateReportFromTemplate_IgnoresRetiredSplitKeys(t *testing.T) {
	defer tearDownReportTest()
	repositories.CreateTestGroupWithUsers()
	grantAppPerms(t, 1, permissions.AppReportsGenerate)
	grantGroupPerms(t, 1, 1, permissions.GroupReportsRead)
	seedLinesReceipt(t)

	var command commands.ReportRequestCommand
	if err := json.Unmarshal([]byte(linesReportBody), &command); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	template, err := repositories.NewReportTemplateRepository(nil).CreateReportTemplate(command, 1)
	if err != nil {
		t.Fatalf("seed report template: %v", err)
	}
	legacy := strings.Replace(string(template.Configuration), `"formats"`, `"splitCategoriesEqually":true,"formats"`, 1)
	if err := repositories.GetDB().Model(&template).Update("configuration", []byte(legacy)).Error; err != nil {
		t.Fatalf("store a legacy configuration: %v", err)
	}

	w, r := reportTemplateIdRequest("POST", 1, fmt.Sprint(template.ID))
	GenerateReportFromTemplate(w, r)

	assertStatus(t, w, http.StatusOK)
	content := w.Body.String()
	if !strings.Contains(content, "60.00") || !strings.Contains(content, "40.00") || strings.Contains(content, "200.00") {
		t.Errorf("expected 60.00 / 40.00 buckets and a 100.00 total, got:\n%s", content)
	}
}
