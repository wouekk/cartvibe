package repositories

import (
	"github.com/shopspring/decimal"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"testing"
	"time"
)

func setupReceiptTest() {
	CreateTestGroupWithUsers()
	CreateTestCategories()
	createTestTags()
}

func createTestTags() {
	db := GetDB()
	tag1 := models.Tag{
		Name: "test-tag-1",
	}
	tag2 := models.Tag{
		Name: "test-tag-2",
	}
	db.Create(&tag1)
	db.Create(&tag2)
}

func createTestReceipts() {
	db := GetDB()

	// Create receipt with ID 1
	receipt1 := models.Receipt{
		Name:         "Test Receipt 1",
		Amount:       decimal.NewFromFloat(100.00),
		Date:         time.Now(),
		PaidByUserID: 1,
		Status:       models.OPEN,
		GroupId:      1,
	}
	db.Create(&receipt1)

	// Create receipt with ID 2
	receipt2 := models.Receipt{
		Name:         "Test Receipt 2",
		Amount:       decimal.NewFromFloat(200.00),
		Date:         time.Now(),
		PaidByUserID: 2,
		Status:       models.RESOLVED,
		GroupId:      1,
	}
	db.Create(&receipt2)
}

func teardownReceiptTest() {
	TruncateTestDb()
}

func TestShouldCreateReceipt(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	repository := NewReceiptRepository(nil)

	// Create command for new receipt
	command := commands.UpsertReceiptCommand{
		Name:         "New Receipt",
		Amount:       decimal.NewFromFloat(50.75),
		Date:         time.Now(),
		PaidByUserID: 1,
		Status:       models.OPEN,
		GroupId:      1,
		Categories: []commands.UpsertCategoryCommand{
			{
				Id: uintPtr(1),
			},
		},
		Tags: []commands.UpsertTagCommand{
			{
				Id: uintPtr(1),
			},
		},
	}

	createdReceipt, err := repository.CreateReceipt(command, 1, true)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	// Validate created receipt
	if createdReceipt.ID == 0 {
		utils.PrintTestError(t, "Receipt ID should not be 0", nil)
	}

	if createdReceipt.Name != "New Receipt" {
		utils.PrintTestError(t, createdReceipt.Name, "New Receipt")
	}

	if !createdReceipt.Amount.Equal(decimal.NewFromFloat(50.75)) {
		utils.PrintTestError(t, createdReceipt.Amount, decimal.NewFromFloat(50.75))
	}

	if createdReceipt.PaidByUserID != 1 {
		utils.PrintTestError(t, createdReceipt.PaidByUserID, 1)
	}

	if len(createdReceipt.Categories) != 1 {
		utils.PrintTestError(t, len(createdReceipt.Categories), 1)
	}

	if len(createdReceipt.Tags) != 1 {
		utils.PrintTestError(t, len(createdReceipt.Tags), 1)
	}

	if createdReceipt.Status != models.OPEN {
		utils.PrintTestError(t, createdReceipt.Status, models.OPEN)
	}
}

// failingReceiptCommand fails its insert inside CreateReceipt's transaction: the
// status passes ToReceipt but is rejected by ReceiptStatus.Value().
func failingReceiptCommand() commands.UpsertReceiptCommand {
	return commands.UpsertReceiptCommand{
		Name:         "Failing Receipt",
		Amount:       decimal.NewFromFloat(10),
		Date:         time.Now(),
		PaidByUserID: 1,
		Status:       models.ReceiptStatus("NOT_A_STATUS"),
		GroupId:      1,
	}
}

func getReceiptUploadedTasks() []models.SystemTask {
	var tasks []models.SystemTask
	GetDB().Where("type = ?", models.RECEIPT_UPLOADED).Find(&tasks)
	return tasks
}

// A failed manual create records a parentless FAILED RECEIPT_UPLOADED task, which
// is what makes it visible on the admin System Tasks page.
func TestCreateReceiptRecordsFailedUploadTaskWhenItOwnsTheTask(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	_, err := NewReceiptRepository(nil).CreateReceipt(failingReceiptCommand(), 1, true)
	if err == nil {
		utils.PrintTestError(t, err, "an error")
		return
	}

	tasks := getReceiptUploadedTasks()
	if len(tasks) != 1 {
		utils.PrintTestError(t, len(tasks), 1)
		return
	}

	task := tasks[0]
	if task.Status != models.SYSTEM_TASK_FAILED {
		utils.PrintTestError(t, task.Status, models.SYSTEM_TASK_FAILED)
	}
	if task.ResultDescription != err.Error() {
		utils.PrintTestError(t, task.ResultDescription, err.Error())
	}
	if task.RanByUserId == nil || *task.RanByUserId != 1 {
		utils.PrintTestError(t, task.RanByUserId, 1)
	}
	if task.AssociatedSystemTaskId != nil {
		utils.PrintTestError(t, task.AssociatedSystemTaskId, nil)
	}
}

// Quick scan and email pass createSystemTask=false and record the failure
// themselves, so CreateReceipt must not add a second, parentless one.
func TestCreateReceiptLeavesFailedUploadTaskToTheCaller(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	_, err := NewReceiptRepository(nil).CreateReceipt(failingReceiptCommand(), 1, false)
	if err == nil {
		utils.PrintTestError(t, err, "an error")
		return
	}

	if tasks := getReceiptUploadedTasks(); len(tasks) != 0 {
		utils.PrintTestError(t, len(tasks), 0)
	}
}

// TestShouldCreateReceiptWithinOuterTransaction guards against a regression where
// CreateReceipt, when bound to an outer transaction (as QuickScan and email
// attachment ingest do), reloaded the receipt on a fresh pooled connection that
// could not see the still-uncommitted row and returned a zero-ID receipt. That
// zero id then broke the receipt-image foreign key with `receipt_id = 0`.
func TestShouldCreateReceiptWithinOuterTransaction(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	tx := GetDB().Begin()
	defer tx.Rollback()

	repository := NewReceiptRepository(tx)

	command := commands.UpsertReceiptCommand{
		Name:         "Tx Receipt",
		Amount:       decimal.NewFromFloat(10.00),
		Date:         time.Now(),
		PaidByUserID: 1,
		Status:       models.OPEN,
		GroupId:      1,
	}

	createdReceipt, err := repository.CreateReceipt(command, 1, false)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	if createdReceipt.ID == 0 {
		utils.PrintTestError(t, "Receipt ID should not be 0 when created within an outer transaction", nil)
		return
	}

	// The receipt-image foreign key must be satisfiable within the same
	// transaction (the test DB has the foreign_keys pragma enabled).
	fileData := models.FileData{
		Name:      "receipt.pdf",
		FileType:  "application/pdf",
		Size:      1,
		ReceiptId: createdReceipt.ID,
	}
	if err := tx.Create(&fileData).Error; err != nil {
		utils.PrintTestError(t, err, "FileData insert should satisfy the receipt foreign key")
	}
}

func TestShouldGetReceiptById(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()
	createTestReceipts()

	repository := NewReceiptRepository(nil)

	receipt, err := repository.GetReceiptById("1")
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	if receipt.ID != 1 {
		utils.PrintTestError(t, receipt.ID, 1)
	}

	if receipt.Name != "Test Receipt 1" {
		utils.PrintTestError(t, receipt.Name, "Test Receipt 1")
	}

	if !receipt.Amount.Equal(decimal.NewFromFloat(100.00)) {
		utils.PrintTestError(t, receipt.Amount, decimal.NewFromFloat(100.00))
	}
}

func TestShouldGetFullyLoadedReceiptById(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()
	createTestReceipts()

	repository := NewReceiptRepository(nil)

	receipt, err := repository.GetFullyLoadedReceiptById("1")
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	if receipt.ID != 1 {
		utils.PrintTestError(t, receipt.ID, 1)
	}
}

func TestShouldGetReceiptGroupIdByReceiptId(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()
	createTestReceipts()

	repository := NewReceiptRepository(nil)

	groupId, err := repository.GetReceiptGroupIdByReceiptId("1")
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	if groupId != 1 {
		utils.PrintTestError(t, groupId, 1)
	}
}

func TestShouldUpdateReceipt(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()
	createTestReceipts()

	repository := NewReceiptRepository(nil)

	// Create command for updating receipt
	command := commands.UpsertReceiptCommand{
		Name:         "Updated Receipt",
		Amount:       decimal.NewFromFloat(150.25),
		Date:         time.Now(),
		PaidByUserID: 2,
		Status:       models.NEEDS_ATTENTION,
		GroupId:      1,
		Categories: []commands.UpsertCategoryCommand{
			{
				Id: uintPtr(1),
			},
			{
				Id: uintPtr(2),
			},
		},
		Tags: []commands.UpsertTagCommand{
			{
				Id: uintPtr(1),
			},
		},
	}

	updatedReceipt, err := repository.UpdateReceipt("1", command, 1)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	// Validate updated receipt
	if updatedReceipt.Name != "Updated Receipt" {
		utils.PrintTestError(t, updatedReceipt.Name, "Updated Receipt")
	}

	if !updatedReceipt.Amount.Equal(decimal.NewFromFloat(150.25)) {
		utils.PrintTestError(t, updatedReceipt.Amount, decimal.NewFromFloat(150.25))
	}

	if updatedReceipt.PaidByUserID != 2 {
		utils.PrintTestError(t, updatedReceipt.PaidByUserID, 2)
	}

	if updatedReceipt.Status != models.NEEDS_ATTENTION {
		utils.PrintTestError(t, updatedReceipt.Status, models.NEEDS_ATTENTION)
	}

	if len(updatedReceipt.Categories) != 2 {
		utils.PrintTestError(t, len(updatedReceipt.Categories), 2)
	}
}

func TestShouldGetPagedReceiptsByGroupId(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()
	createTestReceipts()

	repository := NewReceiptRepository(nil)

	// Create paged request command
	pagedRequest := commands.ReceiptPagedRequestCommand{
		PagedRequestCommand: commands.PagedRequestCommand{
			Page:          1,
			PageSize:      10,
			OrderBy:       "created_at",
			SortDirection: commands.DESCENDING,
		},
	}

	receipts, count, err := repository.GetPagedReceiptsByGroupId(1, "1", pagedRequest, nil, nil, nil, nil, nil)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	if count != 2 {
		utils.PrintTestError(t, count, 2)
	}

	if len(receipts) != 2 {
		utils.PrintTestError(t, len(receipts), 2)
	}
}

func pagedRequestAllReceipts() commands.ReceiptPagedRequestCommand {
	return commands.ReceiptPagedRequestCommand{
		PagedRequestCommand: commands.PagedRequestCommand{
			Page:          1,
			PageSize:      50,
			OrderBy:       "created_at",
			SortDirection: commands.DESCENDING,
		},
	}
}

func TestGetPagedReceiptsAppliesPaidByVisibilitySingleGroup(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()
	createTestReceipts() // group 1: one receipt paid by user 1, one by user 2

	repository := NewReceiptRepository(nil)

	// Restrict visibility to receipts paid by user 1 only.
	restrictedToUser1 := func(groupId uint) ([]uint, bool, error) {
		return []uint{1}, false, nil
	}
	receipts, count, err := repository.GetPagedReceiptsByGroupId(1, "1", pagedRequestAllReceipts(), nil, restrictedToUser1, nil, nil, nil)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if count != 1 {
		utils.PrintTestError(t, count, 1)
	}
	if len(receipts) != 1 || receipts[0].PaidByUserID != 1 {
		utils.PrintTestError(t, receipts, "only the receipt paid by user 1")
	}

	// Unrestricted resolver returns everything (count must match).
	unrestricted := func(groupId uint) ([]uint, bool, error) {
		return nil, true, nil
	}
	_, count, err = repository.GetPagedReceiptsByGroupId(1, "1", pagedRequestAllReceipts(), nil, unrestricted, nil, nil, nil)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if count != 2 {
		utils.PrintTestError(t, count, 2)
	}

	// An empty-but-restricted set sees nothing (the 0 sentinel matches no rows).
	seeNothing := func(groupId uint) ([]uint, bool, error) {
		return []uint{}, false, nil
	}
	receipts, count, err = repository.GetPagedReceiptsByGroupId(1, "1", pagedRequestAllReceipts(), nil, seeNothing, nil, nil, nil)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if count != 0 || len(receipts) != 0 {
		utils.PrintTestError(t, count, 0)
	}
}

func TestGetPagedReceiptsAppliesPaidByVisibilityAllGroup(t *testing.T) {
	defer TruncateTestDb()
	db := GetDB()

	group1 := models.Group{Name: "pb-all-g1"}
	group2 := models.Group{Name: "pb-all-g2"}
	allGroup := models.Group{Name: "pb-all", IsAllGroup: true}
	db.Create(&group1)
	db.Create(&group2)
	db.Create(&allGroup)

	member := models.User{Username: "pb-all-member", Password: "x"}
	payer1 := models.User{Username: "pb-all-payer1", Password: "x"}
	payer2 := models.User{Username: "pb-all-payer2", Password: "x"}
	db.Create(&member)
	db.Create(&payer1)
	db.Create(&payer2)

	db.Create(&models.GroupMember{GroupID: group1.ID, UserID: member.ID})
	db.Create(&models.GroupMember{GroupID: group2.ID, UserID: member.ID})

	makeReceipt := func(groupId uint, payerId uint, name string) {
		db.Create(&models.Receipt{
			Name:         name,
			Amount:       decimal.NewFromInt(1),
			Date:         time.Now(),
			PaidByUserID: payerId,
			GroupId:      groupId,
			Status:       models.OPEN,
		})
	}
	makeReceipt(group1.ID, payer1.ID, "g1-p1")
	makeReceipt(group1.ID, payer2.ID, "g1-p2")
	makeReceipt(group2.ID, payer1.ID, "g2-p1")
	makeReceipt(group2.ID, payer2.ID, "g2-p2")

	// Different roles per group: group 1 restricted to payer1; group 2 unrestricted.
	resolver := func(groupId uint) ([]uint, bool, error) {
		if groupId == group1.ID {
			return []uint{payer1.ID}, false, nil
		}
		return nil, true, nil
	}

	repository := NewReceiptRepository(nil)
	receipts, count, err := repository.GetPagedReceiptsByGroupId(member.ID, utils.UintToString(allGroup.ID), pagedRequestAllReceipts(), nil, resolver, nil, nil, nil)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	// Visible: g1-p1 (group1 restricted to payer1), g2-p1 + g2-p2 (group2 open).
	// Hidden: g1-p2. totalCount must match the rows actually returned.
	if count != 3 {
		utils.PrintTestError(t, count, 3)
	}
	if len(receipts) != 3 {
		utils.PrintTestError(t, len(receipts), 3)
	}
	for _, receipt := range receipts {
		if receipt.GroupId == group1.ID && receipt.PaidByUserID != payer1.ID {
			utils.PrintTestError(t, receipt.Name, "group 1 should only show payer1's receipt")
		}
	}
}

func TestApplyPaidByDisjunctionFiltersBeforeLimit(t *testing.T) {
	defer TruncateTestDb()
	db := GetDB()

	group := models.Group{Name: "pb-search-grp"}
	visiblePayer := models.User{Username: "pb-search-visible", Password: "x"}
	hiddenPayer := models.User{Username: "pb-search-hidden", Password: "x"}
	db.Create(&group)
	db.Create(&visiblePayer)
	db.Create(&hiddenPayer)

	// Hidden receipts are NEWER (sort first by date desc); the visible one is the
	// oldest, so a limit applied before filtering would drop it.
	for i := 0; i < 5; i++ {
		db.Create(&models.Receipt{
			Name:         "hidden-" + utils.UintToString(uint(i)),
			Amount:       decimal.NewFromInt(1),
			Date:         time.Now().Add(time.Duration(i+1) * time.Hour),
			PaidByUserID: hiddenPayer.ID,
			GroupId:      group.ID,
			Status:       models.OPEN,
		})
	}
	db.Create(&models.Receipt{
		Name:         "visible",
		Amount:       decimal.NewFromInt(1),
		Date:         time.Now(),
		PaidByUserID: visiblePayer.ID,
		GroupId:      group.ID,
		Status:       models.OPEN,
	})

	// The role restricts the group to the visible payer only.
	resolver := func(groupId uint) ([]uint, bool, error) {
		return []uint{visiblePayer.ID}, false, nil
	}

	repository := NewReceiptRepository(nil)
	query := db.Table("receipts").Where("group_id = ?", group.ID)
	query, err := repository.ApplyPaidByDisjunction(query, []uint{group.ID}, resolver)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	// Limit smaller than the hidden count: the visible receipt must still come back
	// because the paid-by predicate is applied in SQL BEFORE the limit. (If it were
	// post-filtered, the limit would return 3 hidden rows -> 0 visible.)
	var receipts []models.Receipt
	err = query.Limit(3).Order("date desc").Find(&receipts).Error
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	if len(receipts) != 1 || receipts[0].PaidByUserID != visiblePayer.ID {
		utils.PrintTestError(t, receipts, "only the visible-payer receipt")
	}
}

func TestApplyPaidByDisjunctionEmptyGroupsFailsClosed(t *testing.T) {
	defer TruncateTestDb()
	db := GetDB()

	group := models.Group{Name: "pb-empty-grp"}
	payer := models.User{Username: "pb-empty-payer", Password: "x"}
	db.Create(&group)
	db.Create(&payer)
	db.Create(&models.Receipt{
		Name:         "r",
		Amount:       decimal.NewFromInt(1),
		Date:         time.Now(),
		PaidByUserID: payer.ID,
		GroupId:      group.ID,
		Status:       models.OPEN,
	})

	resolver := func(groupId uint) ([]uint, bool, error) { return nil, true, nil }

	repository := NewReceiptRepository(nil)
	// No member groups => the helper must fail closed (return zero rows), not leave
	// the query unfiltered.
	query, err := repository.ApplyPaidByDisjunction(db.Table("receipts"), []uint{}, resolver)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	var receipts []models.Receipt
	if err := query.Find(&receipts).Error; err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if len(receipts) != 0 {
		utils.PrintTestError(t, len(receipts), 0)
	}
}

func TestShouldBuildGormFilterQuery(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	repository := NewReceiptRepository(nil)

	// Test simple filter
	pagedRequest := commands.ReceiptPagedRequestCommand{
		PagedRequestCommand: commands.PagedRequestCommand{
			OrderBy: "created_at",
		},
		Filter: commands.ReceiptPagedRequestFilter{
			Name: commands.PagedRequestField{
				Operation: commands.CONTAINS,
				Value:     "test",
			},
		},
	}

	query, err := repository.BuildGormFilterQuery(pagedRequest)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	if query == nil {
		utils.PrintTestError(t, "Query should not be nil", nil)
	}
}

func TestGetPagedReceiptsAppliesGroupFilter(t *testing.T) {
	defer TruncateTestDb()
	db := GetDB()

	group1 := models.Group{Name: "grp-filter-g1"}
	group2 := models.Group{Name: "grp-filter-g2"}
	allGroup := models.Group{Name: "grp-filter-all", IsAllGroup: true}
	db.Create(&group1)
	db.Create(&group2)
	db.Create(&allGroup)

	member := models.User{Username: "grp-filter-member", Password: "x"}
	db.Create(&member)
	db.Create(&models.GroupMember{GroupID: group1.ID, UserID: member.ID})
	db.Create(&models.GroupMember{GroupID: group2.ID, UserID: member.ID})

	makeReceipt := func(groupId uint, name string) {
		db.Create(&models.Receipt{
			Name:         name,
			Amount:       decimal.NewFromInt(1),
			Date:         time.Now(),
			PaidByUserID: member.ID,
			GroupId:      groupId,
			Status:       models.OPEN,
		})
	}
	makeReceipt(group1.ID, "g1-a")
	makeReceipt(group1.ID, "g1-b")
	makeReceipt(group2.ID, "g2-a")
	makeReceipt(group2.ID, "g2-b")

	// Group filter ids arrive as float64 (JSON-decoded), matching production.
	groupFilterRequest := func(groupIds ...uint) commands.ReceiptPagedRequestCommand {
		values := make([]interface{}, 0, len(groupIds))
		for _, id := range groupIds {
			values = append(values, float64(id))
		}
		request := pagedRequestAllReceipts()
		request.Filter.Group = commands.PagedRequestField{
			Operation: commands.CONTAINS,
			Value:     values,
		}
		return request
	}

	repository := NewReceiptRepository(nil)

	// All-groups view filtered to group1: only group1's receipts return.
	receipts, count, err := repository.GetPagedReceiptsByGroupId(
		member.ID, utils.UintToString(allGroup.ID), groupFilterRequest(group1.ID), nil, nil, nil, nil, nil,
	)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if count != 2 || len(receipts) != 2 {
		utils.PrintTestError(t, count, 2)
	}
	for _, receipt := range receipts {
		if receipt.GroupId != group1.ID {
			utils.PrintTestError(t, receipt.Name, "only group1 receipts should return")
		}
	}

	otherGroup := models.Group{Name: "grp-filter-other"}
	db.Create(&otherGroup)
	// member is intentionally NOT added to otherGroup, but it has a receipt.
	makeReceipt(otherGroup.ID, "other-a")

	// All-groups view filtered to a group the user has no membership in: the
	// mandatory member-group scope excludes it, so nothing leaks even though the
	// group has a receipt.
	_, count, err = repository.GetPagedReceiptsByGroupId(
		member.ID, utils.UintToString(allGroup.ID), groupFilterRequest(otherGroup.ID), nil, nil, nil, nil, nil,
	)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if count != 0 {
		utils.PrintTestError(t, count, 0)
	}

	// Single-group view (group1) filtered to group2: the mandatory group scope and
	// the group filter intersect to nothing, so a user cannot surface another
	// group's receipts through the filter.
	_, count, err = repository.GetPagedReceiptsByGroupId(
		member.ID, utils.UintToString(group1.ID), groupFilterRequest(group2.ID), nil, nil, nil, nil, nil,
	)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if count != 0 {
		utils.PrintTestError(t, count, 0)
	}
}

func uintPtr(v uint) *uint {
	return &v
}

// Helper function to count rows in junction tables
func countJunctionTableRows(tableName string, itemId uint) int64 {
	db := GetDB()
	var count int64
	db.Table(tableName).Where("item_id = ?", itemId).Count(&count)
	return count
}

// The table's Shop column shows the shop, or the receipt's name when none was read, and sorts the same way.
func TestGetPagedReceiptsSortsByShopFallingBackToTheName(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	for _, receipt := range []models.Receipt{
		{Name: "Zebra receipt", ShopName: "Aldi", GroupId: 1, PaidByUserID: 1},
		{Name: "Beta receipt", GroupId: 1, PaidByUserID: 1},
		{Name: "Receipt 20 Oct", ShopName: "Rewe", GroupId: 1, PaidByUserID: 1},
	} {
		receipt := receipt
		GetDB().Create(&receipt)
	}

	request := pagedRequestAllReceipts()
	request.OrderBy = "shop_name"
	request.SortDirection = commands.ASCENDING

	receipts, _, err := NewReceiptRepository(nil).GetPagedReceiptsByGroupId(1, "1", request, nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	var shown []string
	for _, receipt := range receipts {
		if receipt.ShopName != "" {
			shown = append(shown, receipt.ShopName)
		} else {
			shown = append(shown, receipt.Name)
		}
	}

	want := []string{"Aldi", "Beta receipt", "Rewe"}
	if len(shown) != len(want) || shown[0] != want[0] || shown[1] != want[1] || shown[2] != want[2] {
		t.Errorf("expected %v, got %v", want, shown)
	}
}
