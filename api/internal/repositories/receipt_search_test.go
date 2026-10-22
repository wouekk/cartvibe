package repositories

import (
	"sort"
	"testing"

	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/utils"

	"github.com/shopspring/decimal"
)

func addSearchProduct(receiptId uint, name string, displayName string, amount string) {
	price := decimal.RequireFromString(amount)
	GetDB().Create(&models.ReceiptProduct{
		ReceiptId:   receiptId,
		Name:        name,
		DisplayName: displayName,
		Amount:      &price,
	})
}

func searchRequest(phrase string, page int, pageSize int) commands.ReceiptPagedRequestCommand {
	return commands.ReceiptPagedRequestCommand{
		PagedRequestCommand: commands.PagedRequestCommand{Page: page, PageSize: pageSize},
		Filter:              commands.ReceiptPagedRequestFilter{Search: phrase},
	}
}

func searchNames(t *testing.T, phrase string, paidBy PaidByAllowedResolver) ([]string, int64) {
	receipts, count, err := NewReceiptRepository(nil).GetPagedReceiptsByGroupId(
		1, "1", searchRequest(phrase, 1, 50), nil, paidBy, nil, nil, nil,
	)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return nil, 0
	}

	names := make([]string, 0, len(receipts))
	for _, receipt := range receipts {
		names = append(names, receipt.Name)
	}
	sort.Strings(names)

	return names, count
}

func TestSearchMatchesNameShopCommentAndProductLines(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	byName := createSortableReceipt("Chocolate festival")
	byShop := createSortableReceipt("r-shop")
	GetDB().Model(&byShop).Update("shop_name", "Choc Shop")
	byComment := createSortableReceipt("r-comment")
	addCommentAt(byComment.ID, uintPtr(1), "bought choclate for the party", firstCommentBaseTime)
	byProduct := createSortableReceipt("r-product")
	addSearchProduct(byProduct.ID, "CHOC NOIR 70%", "Dark chocolate", "2.49")
	createSortableReceipt("r-nothing")
	other := createSortableReceipt("r-other")
	addSearchProduct(other.ID, "POTATO CHIPS", "Potato chips", "1.20")

	_ = byName

	names, count := searchNames(t, "chocolate", nil)
	assertOrder(t, names, []string{"Chocolate festival", "r-comment", "r-product", "r-shop"})
	if count != 4 {
		utils.PrintTestError(t, count, 4)
	}
}

func TestSearchTolerantOfOcrAbbreviationsAndTypos(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	milka := createSortableReceipt("r-milka")
	addSearchProduct(milka.ID, "MILKA CHOC", "", "1.80")
	typo := createSortableReceipt("r-typo")
	addSearchProduct(typo.ID, "CHOCLATE MILK", "", "1.40")

	names, _ := searchNames(t, "chocolate", nil)
	assertOrder(t, names, []string{"r-milka", "r-typo"})
}

func TestSearchCountAndPagingFollowTheMatches(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	for _, name := range []string{"milk a", "milk b", "milk c", "bread"} {
		createSortableReceipt(name)
	}

	receipts, count, err := NewReceiptRepository(nil).GetPagedReceiptsByGroupId(
		1, "1", searchRequest("milk", 2, 2), nil, nil, nil, nil, nil,
	)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if count != 3 {
		utils.PrintTestError(t, count, 3)
	}
	if len(receipts) != 1 {
		utils.PrintTestError(t, len(receipts), 1)
	}
}

func TestSearchNeverShowsAReceiptThePaidByRulesHide(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	visible := createSortableReceipt("visible cola")
	addSearchProduct(visible.ID, "COLA", "", "1.00")
	hidden := createSortableReceipt("hidden cola")
	GetDB().Model(&hidden).Update("paid_by_user_id", 2)
	addSearchProduct(hidden.ID, "COLA", "", "1.00")

	onlySelf := func(groupId uint) ([]uint, bool, error) {
		return []uint{1}, false, nil
	}

	names, count := searchNames(t, "cola", onlySelf)
	assertOrder(t, names, []string{"visible cola"})
	if count != 1 {
		utils.PrintTestError(t, count, 1)
	}
}

func TestSearchWithBlankOrTinyPhraseDoesNotNarrow(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	createSortableReceipt("one")
	createSortableReceipt("two")

	for _, phrase := range []string{"", "   ", "a"} {
		names, _ := searchNames(t, phrase, nil)
		if len(names) != 2 {
			utils.PrintTestError(t, len(names), 2)
		}
	}
}

func TestGetProductSearchMatchesCapsAndNamesTheLines(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	receipt := createSortableReceipt("r-many")
	addSearchProduct(receipt.ID, "CHOC A", "Chocolate A", "1.00")
	addSearchProduct(receipt.ID, "BREAD", "Bread", "2.00")
	addSearchProduct(receipt.ID, "CHOC B", "", "1.50")
	addSearchProduct(receipt.ID, "CHOC C", "Chocolate C", "1.60")
	addSearchProduct(receipt.ID, "CHOC D", "Chocolate D", "1.70")
	nameOnly := createSortableReceipt("Chocolate name only")

	matches, err := NewReceiptRepository(nil).GetProductSearchMatches(
		[]uint{receipt.ID, nameOnly.ID}, utils.NewFuzzyQuery("chocolate"),
	)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	lines := matches[receipt.ID]
	if len(lines) != 3 {
		utils.PrintTestError(t, len(lines), 3)
		return
	}
	if lines[0].Name != "Chocolate A" || lines[1].Name != "CHOC B" || lines[2].Name != "Chocolate C" {
		utils.PrintTestError(t, lines, "Chocolate A, CHOC B, Chocolate C")
	}
	if len(matches[nameOnly.ID]) != 0 {
		utils.PrintTestError(t, matches[nameOnly.ID], "no product lines")
	}
}
