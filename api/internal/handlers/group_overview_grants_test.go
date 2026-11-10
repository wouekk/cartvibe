package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

// seedOverviewLine stores a priced product line with a category (nil for none) and tags.
func seedOverviewLine(t *testing.T, receiptId uint, amount string, categoryId *uint, health string, tags ...models.Tag) {
	t.Helper()

	value := decimal.RequireFromString(amount)
	product := models.ReceiptProduct{ReceiptId: receiptId, Name: "line " + amount, Amount: &value, CategoryId: categoryId, Tags: tags}
	product.Health = health
	if err := repositories.GetDB().Create(&product).Error; err != nil {
		t.Fatalf("seed product: %v", err)
	}
}

// seedGroupReceipt stores a receipt in groupId paid by userId, dated on a calendar day.
func seedGroupReceipt(t *testing.T, groupId uint, userId uint, day string, amount string) models.Receipt {
	t.Helper()

	date, err := time.Parse(time.DateOnly, day)
	if err != nil {
		t.Fatalf("parse day: %v", err)
	}
	receipt := models.Receipt{
		Name:         "grant receipt",
		Amount:       decimal.RequireFromString(amount),
		Date:         date,
		PaidByUserID: userId,
		GroupId:      groupId,
		Status:       models.RESOLVED,
	}
	if err := repositories.GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}
	return receipt
}

func overviewCategoryTotals(overview structs.GroupOverview) map[string]string {
	totals := map[string]string{}
	for _, category := range overview.Categories {
		totals[category.Name] = category.Total.String()
	}
	return totals
}

// A member whose role sees only Groceries and Kids: a hidden line category is the (Restricted) slice, a
// hidden tag gets no tile and adds nothing, and drilling into a hidden id lists nothing.
func TestGroupOverviewKeepsHiddenCategoriesAndTagsHidden(t *testing.T) {
	defer tearDownGroupOverviewTest()
	db := repositories.GetDB()

	groceries := models.Category{Name: "Groceries"}
	salary := models.Category{Name: "Salary"}
	db.Create(&groceries)
	db.Create(&salary)
	kids := models.Tag{Name: "Kids", ShowOnDashboard: true}
	secret := models.Tag{Name: "Secret", ShowOnDashboard: true}
	db.Create(&kids)
	db.Create(&secret)

	userId, groupId := seedRestrictedReceiptCreatorWithGrants(t, []uint{groceries.ID}, []uint{kids.ID})

	receipt := seedGroupReceipt(t, groupId, userId, "2026-10-03", "10.00")
	seedOverviewLine(t, receipt.ID, "4.00", &groceries.ID, models.HEALTH_HEALTHY, kids)
	seedOverviewLine(t, receipt.ID, "5.00", &salary.ID, models.HEALTH_UNHEALTHY, secret)
	seedOverviewLine(t, receipt.ID, "0.50", &salary.ID, "", kids, secret)

	groupIdString := fmt.Sprint(groupId)
	w := callGetGroupOverview(userId, groupIdString, "2026-10")
	assertStatus(t, w, http.StatusOK)
	body := w.Body.String()
	if strings.Contains(body, "Salary") || strings.Contains(body, "Secret") {
		t.Fatalf("the overview names a hidden category or tag: %s", body)
	}

	overview := decodeGroupOverview(t, w)
	totals := overviewCategoryTotals(overview)
	want := map[string]string{"Groceries": "4", "(Restricted)": "5.5", "Uncategorized": "0.5"}
	if len(totals) != len(want) {
		t.Fatalf("expected categories %v, got %v", want, totals)
	}
	for name, total := range want {
		if totals[name] != total {
			t.Errorf("category %s: expected %s, got %s", name, total, totals[name])
		}
	}
	for _, category := range overview.Categories {
		if category.Name == "(Restricted)" && category.CategoryId != nil {
			t.Errorf("the (Restricted) slice must not carry the hidden category id, got %d", *category.CategoryId)
		}
	}

	if len(overview.Tags) != 1 || overview.Tags[0].TagId != kids.ID || overview.Tags[0].Total.String() != "4.5" {
		t.Errorf("expected only the Kids tile of 4.5, got %+v", overview.Tags)
	}
	// The unhealthy tile is not a category or tag: hidden lines still count there.
	if overview.UnhealthyTotal.String() != "5" {
		t.Errorf("expected unhealthy 5, got %s", overview.UnhealthyTotal)
	}

	for _, query := range []string{
		fmt.Sprintf("?kind=FOODGROUP&categoryId=%d&month=2026-10", salary.ID),
		fmt.Sprintf("?kind=TAG&tagId=%d&month=2026-10", secret.ID),
		"?kind=FOODGROUP&foodGroup=%28Restricted%29&month=2026-10",
	} {
		w = callOverviewHandler(GetOverviewProducts, userId, groupIdString, query)
		assertStatus(t, w, http.StatusOK)
		if products := decodeShoppingListResponse[[]structs.GroupOverviewProduct](t, w); len(products) != 0 {
			t.Errorf("%s: expected no lines behind a hidden id, got %+v", query, products)
		}
	}

	w = callOverviewHandler(GetOverviewProducts, userId, groupIdString, fmt.Sprintf("?kind=FOODGROUP&categoryId=%d&month=2026-10", groceries.ID))
	if products := decodeShoppingListResponse[[]structs.GroupOverviewProduct](t, w); len(products) != 1 {
		t.Errorf("expected the one Groceries line, got %+v", products)
	}
	w = callOverviewHandler(GetOverviewProducts, userId, groupIdString, fmt.Sprintf("?kind=TAG&tagId=%d&month=2026-10", kids.ID))
	if products := decodeShoppingListResponse[[]structs.GroupOverviewProduct](t, w); len(products) != 2 {
		t.Errorf("expected the two Kids lines, got %+v", products)
	}
}

// The "All" group's own role is unrestricted, so its Dashboard judges each line in its real group, and a
// tile needs the tag visible in a real group the caller reads.
func TestGroupOverviewForAllJudgesGrantsInTheRealGroups(t *testing.T) {
	defer tearDownGroupOverviewTest()
	db := repositories.GetDB()

	groceries := models.Category{Name: "Groceries"}
	salary := models.Category{Name: "Salary"}
	db.Create(&groceries)
	db.Create(&salary)
	kids := models.Tag{Name: "Kids", ShowOnDashboard: true}
	secret := models.Tag{Name: "Secret", ShowOnDashboard: true}
	db.Create(&kids)
	db.Create(&secret)

	userId, groupId := seedRestrictedReceiptCreatorWithGrants(t, []uint{groceries.ID}, []uint{kids.ID})
	allGroup, err := repositories.NewGroupRepository(nil).CreateAllGroup(userId)
	if err != nil {
		t.Fatalf("create All group: %v", err)
	}
	grantAllGroupPerms(t, userId, allGroup.ID)

	receipt := seedGroupReceipt(t, groupId, userId, "2026-10-03", "10.00")
	seedOverviewLine(t, receipt.ID, "4.00", &groceries.ID, "", kids)
	seedOverviewLine(t, receipt.ID, "6.00", &salary.ID, "", secret)

	w := callGetGroupOverview(userId, fmt.Sprint(allGroup.ID), "2026-10")
	assertStatus(t, w, http.StatusOK)
	if body := w.Body.String(); strings.Contains(body, "Salary") || strings.Contains(body, "Secret") {
		t.Fatalf("the All overview names a hidden category or tag: %s", body)
	}
	overview := decodeGroupOverview(t, w)
	if totals := overviewCategoryTotals(overview); totals["Groceries"] != "4" || totals["(Restricted)"] != "6" {
		t.Errorf("expected Groceries 4 and (Restricted) 6, got %v", totals)
	}
	if len(overview.Tags) != 1 || overview.Tags[0].TagId != kids.ID {
		t.Errorf("expected only the Kids tile, got %+v", overview.Tags)
	}
}

// Without restrictions the same household sees every name: the grants only narrow.
func TestGroupOverviewShowsEveryCategoryAndTagWhenUnrestricted(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	db := repositories.GetDB()

	salary := models.Category{Name: "Salary"}
	db.Create(&salary)
	secret := models.Tag{Name: "Secret", ShowOnDashboard: true}
	db.Create(&secret)

	receipt := seedGroupReceipt(t, 1, 1, "2026-10-03", "10.00")
	seedOverviewLine(t, receipt.ID, "5.00", &salary.ID, "", secret)

	overview := decodeGroupOverview(t, callGetGroupOverview(1, "1", "2026-10"))
	if totals := overviewCategoryTotals(overview); totals["Salary"] != "5" || totals["Uncategorized"] != "5" {
		t.Errorf("expected Salary 5 and Uncategorized 5, got %v", totals)
	}
	if len(overview.Tags) != 1 || overview.Tags[0].Name != "Secret" || overview.Tags[0].Total.String() != "5" {
		t.Errorf("expected the Secret tile of 5, got %+v", overview.Tags)
	}
}

// Lines adding up to more than the receipt, or pointing the other way (a refund), are scaled to it as in
// reports, so the category slices always add up to the total, and the tiles never claim more than was spent.
func TestGroupOverviewSlicesAddUpToTheTotal(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)
	db := repositories.GetDB()

	dairy := models.Category{Name: "Dairy"}
	snacks := models.Category{Name: "Snacks"}
	db.Create(&dairy)
	db.Create(&snacks)
	party := models.Tag{Name: "Party", ShowOnDashboard: true}
	db.Create(&party)

	// Lines of 12.00 on a receipt of 6.00: halved.
	over := seedGroupReceipt(t, 1, 1, "2026-10-03", "6.00")
	seedOverviewLine(t, over.ID, "8.00", &dairy.ID, models.HEALTH_HEALTHY)
	seedOverviewLine(t, over.ID, "4.00", &snacks.ID, models.HEALTH_UNHEALTHY, party)
	// A refund whose line is positive: scaled to the negative amount.
	refund := seedGroupReceipt(t, 1, 1, "2026-10-04", "-2.00")
	seedOverviewLine(t, refund.ID, "2.00", &snacks.ID, models.HEALTH_UNHEALTHY, party)
	// Lines under the receipt: the rest is Uncategorized.
	under := seedGroupReceipt(t, 1, 1, "2026-10-05", "3.00")
	seedOverviewLine(t, under.ID, "1.00", &dairy.ID, "")

	overview := decodeGroupOverview(t, callGetGroupOverview(1, "1", "2026-10"))
	if overview.Total.String() != "7" {
		t.Fatalf("expected total 7, got %s", overview.Total)
	}

	sum := decimal.Zero
	for _, category := range overview.Categories {
		sum = sum.Add(category.Total)
	}
	if !sum.Equal(overview.Total) {
		t.Errorf("slices add up to %s, total is %s: %+v", sum, overview.Total, overview.Categories)
	}
	totals := overviewCategoryTotals(overview)
	if totals["Dairy"] != "5" || totals["Snacks"] != "0" || totals["Uncategorized"] != "2" {
		t.Errorf("expected Dairy 5, Snacks 0 (2 - 2), Uncategorized 2, got %v", totals)
	}

	if overview.UnhealthyTotal.String() != "0" {
		t.Errorf("expected unhealthy 2 - 2 = 0, got %s", overview.UnhealthyTotal)
	}
	if len(overview.Tags) != 1 || overview.Tags[0].Total.String() != "0" {
		t.Errorf("expected the Party tile at 2 - 2 = 0, got %+v", overview.Tags)
	}
}
