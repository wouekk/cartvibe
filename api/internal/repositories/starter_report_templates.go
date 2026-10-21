package repositories

import (
	"strconv"
	"time"

	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"

	"gorm.io/gorm"
)

// starterReportTemplatesMigration is the ledger name that records the starter report templates were created, so
// deleting one is never undone by the next boot.
const starterReportTemplatesMigration = "starter-report-templates-2026-10"

// StarterReportTemplates are the reports a household finds ready the first time it opens Reports: where the
// money went, by shop, and how the year is going. Each covers the household group and the year to date.
func StarterReportTemplates(groupId uint) []commands.ReportRequestCommand {
	groupIds := []string{strconv.FormatUint(uint64(groupId), 10)}
	period := commands.ReportPeriod{Preset: commands.ReportPeriodYtd}
	spent := commands.ReportColumn{Kind: commands.ReportColumnAggregate, Name: "Spent", Label: "Spent", AggFunc: "SUM", Measure: "amount"}
	receipts := commands.ReportColumn{Kind: commands.ReportColumnAggregate, Name: "Receipts", Label: "Receipts", AggFunc: "COUNT"}
	average := commands.ReportColumn{Kind: commands.ReportColumnAggregate, Name: "Average", Label: "Average receipt", AggFunc: "AVG", Measure: "amount"}
	formats := []string{commands.ReportFormatPdf}

	return []commands.ReportRequestCommand{
		{
			Name:     "Monthly spending by category",
			GroupIds: groupIds,
			Period:   period,
			GroupBy:  []string{"date_month"},
			GroupByLabels: map[string]string{
				"date_month": "Month",
			},
			Detail: commands.ReportDetail{Mode: commands.ReportDetailAggregate, By: "category"},
			Columns: []commands.ReportColumn{
				{Kind: commands.ReportColumnDimension, Name: "Category", Label: "Category", Field: "category"},
				spent,
				receipts,
			},
			Subtotals:   true,
			GrandTotals: true,
			Document: commands.ReportDocument{
				Title:  "Monthly spending by category",
				Intro:  "What the household spent each month, split by category, for {{period}}.",
				Footer: "Generated {{generatedAt}}",
			},
			Formats: formats,
		},
		{
			Name:     "Spending by shop",
			GroupIds: groupIds,
			Period:   period,
			GroupBy:  []string{},
			Detail:   commands.ReportDetail{Mode: commands.ReportDetailAggregate, By: "shop"},
			Columns: []commands.ReportColumn{
				{Kind: commands.ReportColumnDimension, Name: "Shop", Label: "Shop", Field: "shop"},
				spent,
				receipts,
				average,
			},
			GrandTotals: true,
			Document: commands.ReportDocument{
				Title:  "Spending by shop",
				Intro:  "Where the household shops and how much goes to each shop, for {{period}}.",
				Footer: "Generated {{generatedAt}}",
			},
			Formats: formats,
		},
		{
			Name:     "Month by month",
			GroupIds: groupIds,
			Period:   period,
			GroupBy:  []string{},
			Detail:   commands.ReportDetail{Mode: commands.ReportDetailAggregate, By: "date_month"},
			Columns: []commands.ReportColumn{
				{Kind: commands.ReportColumnDimension, Name: "Month", Label: "Month", Field: "date_month"},
				spent,
				receipts,
				average,
			},
			GrandTotals: true,
			Document: commands.ReportDocument{
				Title:  "Month by month",
				Intro:  "The year so far: total spent, number of receipts and the average receipt each month, for {{period}}.",
				Footer: "Generated {{generatedAt}}",
			},
			Formats: formats,
		},
	}
}

// SeedStarterReportTemplates creates the starter templates once, for the first account and the Household
// group (else the first real group). It does nothing, and tries again next boot, until both exist; once they
// have been created they are recorded, so a template an admin deletes stays deleted.
func SeedStarterReportTemplates() error {
	db := GetDB()

	var applied int64
	if err := db.Model(&models.DataMigration{}).Where("name = ?", starterReportTemplatesMigration).Count(&applied).Error; err != nil {
		return err
	}
	if applied > 0 {
		return nil
	}

	var admin models.User
	if err := db.Order("id ASC").Limit(1).Find(&admin).Error; err != nil {
		return err
	}

	var group models.Group
	if err := db.Where("name = ?", HouseholdGroupName).Limit(1).Find(&group).Error; err != nil {
		return err
	}
	if group.ID == 0 {
		if err := db.Where("is_all_group IS NULL OR is_all_group = ?", false).Order("id ASC").Limit(1).Find(&group).Error; err != nil {
			return err
		}
	}
	if admin.ID == 0 || group.ID == 0 {
		return nil
	}

	return db.Transaction(func(tx *gorm.DB) error {
		repository := NewReportTemplateRepository(tx)
		for _, command := range StarterReportTemplates(group.ID) {
			if _, err := repository.CreateReportTemplate(command, admin.ID); err != nil {
				return err
			}
		}

		return tx.Create(&models.DataMigration{Name: starterReportTemplatesMigration, AppliedAt: time.Now()}).Error
	})
}
