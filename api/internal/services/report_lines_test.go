package services

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/reporting"
	"cartvibe/api/internal/reporting/receiptsource"
	"cartvibe/api/internal/repositories"
)

// testLine is one product line a test puts on a receipt.
type testLine struct {
	amount     string
	categoryId uint
	tagIds     []uint
	health     string
	planned    *bool
}

// createLineReceipt inserts a receipt with the given amount and product lines.
func createLineReceipt(t *testing.T, name string, amount string, paidByUserId uint, groupId uint, lines ...testLine) models.Receipt {
	t.Helper()
	db := repositories.GetDB()
	receipt := models.Receipt{
		Name:         name,
		Amount:       decimal.RequireFromString(amount),
		Date:         time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC),
		PaidByUserID: paidByUserId,
		GroupId:      groupId,
		Status:       models.OPEN,
	}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatalf("create receipt %q: %v", name, err)
	}

	for position, line := range lines {
		lineAmount := decimal.RequireFromString(line.amount)
		product := models.ReceiptProduct{
			ReceiptId: receipt.ID,
			Name:      name,
			Amount:    &lineAmount,
			Position:  position,
			Planned:   line.planned,
		}
		product.Health = line.health
		if line.categoryId != 0 {
			categoryId := line.categoryId
			product.CategoryId = &categoryId
		}
		for _, tagId := range line.tagIds {
			product.Tags = append(product.Tags, loadTag(t, tagId))
		}
		if err := db.Create(&product).Error; err != nil {
			t.Fatalf("create line for %q: %v", name, err)
		}
	}
	return receipt
}

func loadTag(t *testing.T, id uint) models.Tag {
	t.Helper()
	var tag models.Tag
	if err := repositories.GetDB().First(&tag, id).Error; err != nil {
		t.Fatalf("load tag %d: %v", id, err)
	}
	return tag
}

// rowSummary renders each row as "categories|tags|amount" for compact asserts.
func rowSummary(rows []reporting.Row) []string {
	texts := func(values []reporting.Value) string {
		parts := make([]string, 0, len(values))
		for _, value := range values {
			text, _ := value.Text()
			parts = append(parts, text)
		}
		return strings.Join(parts, ",")
	}

	result := make([]string, len(rows))
	for index, row := range rows {
		amount, _ := row.Measure(receiptsource.KeyAmount).Decimal()
		result[index] = texts(row.Get(receiptsource.KeyCategory)) + "|" + texts(row.Get(receiptsource.KeyTag)) + "|" + amount.StringFixed(2)
	}
	return result
}

func assertSummary(t *testing.T, rows []reporting.Row, want []string) {
	t.Helper()
	if got := rowSummary(rows); !reflect.DeepEqual(got, want) {
		t.Errorf("rows = %v, want %v", got, want)
	}
}

func boolValue(value bool) *bool { return &value }

// ---- ReportDataService ------------------------------------------------------

// Without a line dimension a receipt is one row, labelled with its lines'
// categories and tags; the receipt's own (old schema) categories are not read.
func TestReportDataService_RowsLabelWithTheLines(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	food := makeCategory(t, "Food")
	fuel := makeCategory(t, "Fuel")
	old := loadCategory(t, makeCategory(t, "Old"))
	kids := makeTag(t, "Kids")
	userId, groupId, _ := seedMemberWithGroupRoleGrants(t, "lines-label", nil, nil)
	receipt := createLineReceipt(t, "two", "100", userId, groupId,
		testLine{amount: "60", categoryId: food, tagIds: []uint{kids}},
		testLine{amount: "40", categoryId: fuel})
	if err := repositories.GetDB().Model(&receipt).Association("Categories").Append(&old); err != nil {
		t.Fatalf("attach a receipt-level category: %v", err)
	}

	_, rows, err := NewReportDataService(nil).Rows(userId, groupIdString(groupId), commands.ReceiptPagedRequestFilter{})
	if err != nil {
		t.Fatalf("Rows: %v", err)
	}
	assertSummary(t, rows, []string{"Food,Fuel|Kids|100.00"})
}

// Cutting by category: each category carries its lines' cost, and what they
// leave over is the (None) row.
func TestReportDataService_CutsByLineCategory(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	food := makeCategory(t, "Food")
	fuel := makeCategory(t, "Fuel")
	userId, groupId, _ := seedMemberWithGroupRoleGrants(t, "lines-cut", nil, nil)
	createLineReceipt(t, "three", "100", userId, groupId,
		testLine{amount: "30", categoryId: food},
		testLine{amount: "10", categoryId: fuel},
		testLine{amount: "20", categoryId: food})

	rowSet, err := NewReportDataService(nil).RowsWithLines(userId, groupIdString(groupId), commands.ReceiptPagedRequestFilter{},
		receiptsource.LineDimensions{Category: true})
	if err != nil {
		t.Fatalf("RowsWithLines: %v", err)
	}

	assertSummary(t, rowSet.Rows, []string{"Food||50.00", "Fuel||10.00", "||40.00"})
	if !reflect.DeepEqual(rowSet.RowsPerReceipt, []int{3}) {
		t.Errorf("RowsPerReceipt = %v, want [3]", rowSet.RowsPerReceipt)
	}
}

// A renamed category reports under its current name.
func TestReportDataService_LineCategoryUsesTheCurrentName(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	food := makeCategory(t, "Food")
	userId, groupId, _ := seedMemberWithGroupRoleGrants(t, "lines-rename", nil, nil)
	createLineReceipt(t, "r", "10", userId, groupId, testLine{amount: "10", categoryId: food})
	if err := repositories.GetDB().Model(&models.Category{}).Where("id = ?", food).Update("name", "Groceries").Error; err != nil {
		t.Fatalf("rename: %v", err)
	}

	_, rows, err := NewReportDataService(nil).Rows(userId, groupIdString(groupId), commands.ReceiptPagedRequestFilter{})
	if err != nil {
		t.Fatalf("Rows: %v", err)
	}
	assertSummary(t, rows, []string{"Groceries||10.00"})
}

// A line category the viewer may not see reads as (Restricted). The division is
// by the lines, so a visible category's share is the same for every viewer and
// (Restricted) receives exactly the hidden lines.
func TestReportDataService_RestrictsHiddenLineCategories(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	visibleId := makeCategory(t, "Visible")
	hiddenOne := makeCategory(t, "HiddenOne")
	hiddenTwo := makeCategory(t, "HiddenTwo")
	restrictedUser, groupId, _ := seedMemberWithGroupRoleGrants(t, "lines-restricted", []uint{visibleId}, nil)

	unrestrictedRole, err := repositories.NewRoleRepository(nil).CreateGroupRole(
		"Unrestricted lines role", "", []string{permissions.GroupReceiptsRead}, nil, nil, nil, false, false)
	if err != nil {
		t.Fatalf("seed role: %v", err)
	}
	unrestrictedUser := makeUser(t, "lines-unrestricted")
	if err := repositories.GetDB().Create(&models.GroupMember{GroupID: groupId, UserID: unrestrictedUser, GroupRoleID: &unrestrictedRole.ID}).Error; err != nil {
		t.Fatalf("seed member: %v", err)
	}

	createLineReceipt(t, "mixed", "60", restrictedUser, groupId,
		testLine{amount: "10", categoryId: visibleId},
		testLine{amount: "20", categoryId: hiddenOne},
		testLine{amount: "30", categoryId: hiddenTwo})

	dimensions := receiptsource.LineDimensions{Category: true}
	restricted, err := NewReportDataService(nil).RowsWithLines(restrictedUser, groupIdString(groupId), commands.ReceiptPagedRequestFilter{}, dimensions)
	if err != nil {
		t.Fatalf("RowsWithLines (restricted): %v", err)
	}
	unrestricted, err := NewReportDataService(nil).RowsWithLines(unrestrictedUser, groupIdString(groupId), commands.ReceiptPagedRequestFilter{}, dimensions)
	if err != nil {
		t.Fatalf("RowsWithLines (unrestricted): %v", err)
	}

	assertSummary(t, restricted.Rows, []string{"Visible||10.00", "(Restricted)||50.00"})
	assertSummary(t, unrestricted.Rows, []string{"Visible||10.00", "HiddenOne||20.00", "HiddenTwo||30.00"})
}

// A tag the viewer may not see reads as (Restricted) on the line too.
func TestReportDataService_RestrictsHiddenLineTags(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	alex := makeTag(t, "Alex")
	sam := makeTag(t, "Sam")
	userId, groupId, _ := seedMemberWithGroupRoleGrants(t, "lines-tags", nil, []uint{alex})
	createLineReceipt(t, "r", "10", userId, groupId,
		testLine{amount: "4", tagIds: []uint{alex}},
		testLine{amount: "6", tagIds: []uint{sam}})

	rowSet, err := NewReportDataService(nil).RowsWithLines(userId, groupIdString(groupId), commands.ReceiptPagedRequestFilter{},
		receiptsource.LineDimensions{Tag: true})
	if err != nil {
		t.Fatalf("RowsWithLines: %v", err)
	}
	assertSummary(t, rowSet.Rows, []string{"|Alex|4.00", "|(Restricted)|6.00"})
}

// ---- lineDimensionsInUse / capRowsToReceipts --------------------------------

func TestReportService_LineDimensionsInUse(t *testing.T) {
	tests := []struct {
		name    string
		command commands.ReportRequestCommand
		want    receiptsource.LineDimensions
	}{
		{"aggregate by category", commands.ReportRequestCommand{
			GroupBy: []string{"group"},
			Detail:  commands.ReportDetail{Mode: commands.ReportDetailAggregate, By: "category"},
		}, receiptsource.LineDimensions{Category: true}},
		{"grouped by tag and health", commands.ReportRequestCommand{
			GroupBy: []string{"tag", "health"},
			Detail:  commands.ReportDetail{Mode: commands.ReportDetailRecords},
		}, receiptsource.LineDimensions{Tag: true, Health: true}},
		{"records mode with a stray by", commands.ReportRequestCommand{
			Detail: commands.ReportDetail{Mode: commands.ReportDetailRecords, By: "category"},
		}, receiptsource.LineDimensions{}},
		{"aggregate by planned", commands.ReportRequestCommand{
			Detail: commands.ReportDetail{Mode: commands.ReportDetailAggregate, By: "planned"},
		}, receiptsource.LineDimensions{Planned: true}},
		{"no line field", commands.ReportRequestCommand{
			GroupBy: []string{"paid_by"},
			Detail:  commands.ReportDetail{Mode: commands.ReportDetailAggregate, By: "shop"},
		}, receiptsource.LineDimensions{}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := lineDimensionsInUse(test.command); got != test.want {
				t.Errorf("lineDimensionsInUse = %+v, want %+v", got, test.want)
			}
		})
	}
}

func TestReportService_CapRowsToReceipts(t *testing.T) {
	rows := make([]reporting.Row, 6)
	for index := range rows {
		rows[index] = reporting.Row{receiptsource.KeyName: {reporting.Str(string(rune('a' + index)))}}
	}
	rowsPerReceipt := []int{1, 3, 2}

	tests := []struct {
		limit int
		want  int
	}{
		{0, 6},  // no cap
		{-1, 6}, // no cap
		{1, 1},
		{2, 4}, // the second receipt's three rows come whole
		{3, 6},
		{10, 6},
	}
	for _, test := range tests {
		if got := len(capRowsToReceipts(rows, rowsPerReceipt, test.limit)); got != test.want {
			t.Errorf("capRowsToReceipts(limit %d) kept %d rows, want %d", test.limit, got, test.want)
		}
	}
}

// ---- ReportService end to end ------------------------------------------------

// lineReportCommand groups by group and aggregates by category: Total and Count.
func lineReportCommand(groupIds []uint) commands.ReportRequestCommand {
	command := aggregateReportCommand("Lines", groupIds, []string{commands.ReportFormatCsv})
	command.Columns = append(command.Columns,
		commands.ReportColumn{Kind: commands.ReportColumnAggregate, Name: "Count", Label: "Count", AggFunc: "COUNT"})
	return command
}

func cellFixed(t *testing.T, cells []reporting.Cell, column string) string {
	t.Helper()
	for _, cell := range cells {
		if cell.Column == column {
			number, _ := cell.Value().Decimal()
			return number.StringFixed(2)
		}
	}
	t.Fatalf("no cell for column %s", column)
	return ""
}

func bucketFigures(t *testing.T, rows []reporting.DetailRow, labelColumn string) []string {
	t.Helper()
	result := make([]string, len(rows))
	for index, row := range rows {
		label := ""
		for _, cell := range row.Cells {
			if cell.Column == labelColumn {
				label = cell.Value().String()
			}
		}
		result[index] = label + "=" + cellFixed(t, row.Cells, "Total") + "/" + cellFixed(t, row.Cells, "Count")
	}
	return result
}

// Category buckets add up to what was spent, and the receipt count is receipts,
// not rows.
func TestReportService_BuildModel_CategoryBucketsFromLines(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	food := makeCategory(t, "Food")
	fuel := makeCategory(t, "Fuel")
	userId, groupIds := seedReportUserInGroups(t, "lines-build", "Household")
	createLineReceipt(t, "mixed", "100", userId, groupIds[0],
		testLine{amount: "70", categoryId: food},
		testLine{amount: "30", categoryId: fuel})
	createLineReceipt(t, "one", "20", userId, groupIds[0], testLine{amount: "15", categoryId: food})

	build, err := NewReportService(nil).buildModel(userId, lineReportCommand(groupIds), time.Now(), 0)
	if err != nil {
		t.Fatalf("buildModel: %v", err)
	}

	got := bucketFigures(t, build.model.Root.Children[0].DetailRows, "Category")
	// The rest is the empty bucket, whose label cell holds no value.
	want := []string{"Food=85.00/2.00", "Fuel=30.00/1.00", "<null>=5.00/1.00"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("buckets = %v, want %v", got, want)
	}
	if total := cellFixed(t, build.model.GrandTotals, "Total"); total != "120.00" {
		t.Errorf("grand total = %s, want 120.00", total)
	}
	if build.receiptCount != 2 {
		t.Errorf("receiptCount = %d, want 2 receipts, not the rows", build.receiptCount)
	}
}

// Health is a dimension of its own: the unhealthy share of a receipt is what its
// unhealthy lines cost.
func TestReportService_BuildModel_GroupsByHealth(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	userId, groupIds := seedReportUserInGroups(t, "lines-health", "Household")
	createLineReceipt(t, "r", "10", userId, groupIds[0],
		testLine{amount: "6", health: models.HEALTH_UNHEALTHY, planned: boolValue(false)},
		testLine{amount: "4", health: models.HEALTH_HEALTHY})

	command := lineReportCommand(groupIds)
	command.Detail.By = "health"
	command.Columns[0] = commands.ReportColumn{Kind: commands.ReportColumnDimension, Name: "Health", Label: "Health", Field: "health"}

	build, err := NewReportService(nil).buildModel(userId, command, time.Now(), 0)
	if err != nil {
		t.Fatalf("buildModel: %v", err)
	}
	got := bucketFigures(t, build.model.Root.Children[0].DetailRows, "Health")
	if want := []string{"Healthy=4.00/1.00", "Unhealthy=6.00/1.00"}; !reflect.DeepEqual(got, want) {
		t.Errorf("buckets = %v, want %v", got, want)
	}

	command.Detail.By = "planned"
	command.Columns[0] = commands.ReportColumn{Kind: commands.ReportColumnDimension, Name: "Planned", Label: "Planned", Field: "planned"}
	build, err = NewReportService(nil).buildModel(userId, command, time.Now(), 0)
	if err != nil {
		t.Fatalf("buildModel (planned): %v", err)
	}
	got = bucketFigures(t, build.model.Root.Children[0].DetailRows, "Planned")
	if want := []string{"Planned=4.00/1.00", "Unplanned=6.00/1.00"}; !reflect.DeepEqual(got, want) {
		t.Errorf("buckets = %v, want %v", got, want)
	}
}

// The preview cap counts receipts, so a receipt cut by its lines is never cut
// part-way: all of its rows are in the one-receipt sample.
func TestReportService_BuildModel_CapKeepsWholeReceipts(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	food := makeCategory(t, "Food")
	fuel := makeCategory(t, "Fuel")
	toys := makeCategory(t, "Toys")
	userId, groupIds := seedReportUserInGroups(t, "lines-cap", "Household")
	createLineReceipt(t, "newest", "90", userId, groupIds[0],
		testLine{amount: "30", categoryId: food},
		testLine{amount: "30", categoryId: fuel},
		testLine{amount: "30", categoryId: toys})
	older := createLineReceipt(t, "older", "50", userId, groupIds[0], testLine{amount: "50", categoryId: food})
	if err := repositories.GetDB().Model(&older).Update("date", time.Date(2026, 5, 2, 0, 0, 0, 0, time.UTC)).Error; err != nil {
		t.Fatalf("backdate receipt: %v", err)
	}

	build, err := NewReportService(nil).buildModel(userId, lineReportCommand(groupIds), time.Now(), 1)
	if err != nil {
		t.Fatalf("buildModel: %v", err)
	}
	if build.receiptCount != 2 {
		t.Errorf("receiptCount = %d, want the true 2", build.receiptCount)
	}
	got := bucketFigures(t, build.model.Root.Children[0].DetailRows, "Category")
	if want := []string{"Food=30.00/1.00", "Fuel=30.00/1.00", "Toys=30.00/1.00"}; !reflect.DeepEqual(got, want) {
		t.Errorf("sampled buckets = %v, want all three lines of the newest receipt %v", got, want)
	}
}

func TestReportService_Generate_LinesAcrossGroupsCsv(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	clearRolePermissionCacheAll()

	food := makeCategory(t, "Food")
	fuel := makeCategory(t, "Fuel")
	userId, groupIds := seedReportUserInGroups(t, "lines-csv", "Household", "Roommates")
	createLineReceipt(t, "household", "10", userId, groupIds[0],
		testLine{amount: "5", categoryId: food}, testLine{amount: "5", categoryId: fuel})
	createLineReceipt(t, "roommates", "30", userId, groupIds[1],
		testLine{amount: "15", categoryId: food}, testLine{amount: "15", categoryId: fuel})

	report, err := NewReportService(nil).Generate(userId, lineReportCommand(groupIds))
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	content := string(report.Bytes)
	for _, want := range []string{"Food", "Fuel", "5.00", "15.00", "40.00"} {
		if !strings.Contains(content, want) {
			t.Errorf("CSV is missing %q:\n%s", want, content)
		}
	}
	if strings.Contains(content, "80.00") {
		t.Errorf("CSV double counts (80.00 grand total):\n%s", content)
	}
}
