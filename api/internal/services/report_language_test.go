package services

import (
	"strings"
	"testing"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

// statusReportCommand groups by group and sums by status, with the wording a
// starter template stores (an English title and column label).
func statusReportCommand(groupIds []uint) commands.ReportRequestCommand {
	command := aggregateReportCommand("Live", groupIds, nil)
	command.Detail = commands.ReportDetail{Mode: commands.ReportDetailAggregate, By: "status"}
	command.Columns = []commands.ReportColumn{
		{Kind: commands.ReportColumnDimension, Name: "Status", Label: "Status", Field: "status"},
		{Kind: commands.ReportColumnAggregate, Name: "Spent", Label: "Spent", AggFunc: "SUM", Measure: "amount"},
	}
	command.Document = commands.ReportDocument{Title: "Monthly spending by category"}
	return command
}

func setReaderLanguage(t *testing.T, userId uint, language string) {
	t.Helper()
	preferences := models.UserPrefernces{UserId: userId, Language: language}
	if err := repositories.GetDB().Create(&preferences).Error; err != nil {
		t.Fatalf("seed preferences: %v", err)
	}
}

func assertContainsAll(t *testing.T, html string, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if !strings.Contains(html, want) {
			t.Errorf("report HTML missing %q:\n%s", want, html)
		}
	}
}

// The report reads in the language of the person generating it: the preamble,
// the period, field headings, the values a status is made of, the totals, and a
// starter template's stored English copy. Group and category names are data and
// stay as they are.
func TestReportService_Preview_SpeaksTheReadersLanguage(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	userId, groupIds := seedReportUserInGroups(t, "rpt-lang-de", "Household")
	createReportReceipt(t, "household-1", userId, groupIds[0], nil)
	setReaderLanguage(t, userId, "de")

	preview, err := NewReportService(nil).Preview(userId, statusReportCommand(groupIds))
	if err != nil {
		t.Fatalf("Preview: %v", err)
	}

	assertContainsAll(t, preview.Html,
		`<html lang="de">`,
		"<h1>Monatliche Ausgaben nach Kategorie</h1>",
		"Zeitraum",
		"2026-05-01 bis 2026-05-31",
		"<th>Gruppe</th>",
		"<th>Ausgegeben</th>",
		"Zu prüfen",
		"Gesamtsumme",
		"Household",
	)
	if strings.Contains(preview.Html, "Grand Total") {
		t.Errorf("German report still says Grand Total:\n%s", preview.Html)
	}
}

// Someone who never chose a language (no preferences row) gets the English
// report, word for word as before; a title they typed is never translated.
func TestReportService_Preview_EnglishWithoutALanguage(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	userId, groupIds := seedReportUserInGroups(t, "rpt-lang-en", "Household")
	createReportReceipt(t, "household-1", userId, groupIds[0], nil)

	command := statusReportCommand(groupIds)
	command.Document.Title = "Our groceries"
	preview, err := NewReportService(nil).Preview(userId, command)
	if err != nil {
		t.Fatalf("Preview: %v", err)
	}

	assertContainsAll(t, preview.Html,
		`<html lang="en">`,
		"<h1>Our groceries</h1>",
		"Period",
		"2026-05-01 to 2026-05-31",
		"<th>Group</th>",
		"<th>Spent</th>",
		"To check",
		"Grand Total",
	)
}

// A language the API has no words for falls back to English rather than failing.
func TestReportService_Preview_UnknownLanguageIsEnglish(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	userId, groupIds := seedReportUserInGroups(t, "rpt-lang-xx", "Household")
	createReportReceipt(t, "household-1", userId, groupIds[0], nil)
	setReaderLanguage(t, userId, "xx")

	preview, err := NewReportService(nil).Preview(userId, statusReportCommand(groupIds))
	if err != nil {
		t.Fatalf("Preview: %v", err)
	}
	assertContainsAll(t, preview.Html, `<html lang="en">`, "Grand Total", "Monthly spending by category")
}
