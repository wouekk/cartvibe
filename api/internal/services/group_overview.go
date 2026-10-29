package services

import (
	"errors"
	"sort"
	"strings"
	"time"
	"unicode"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"gorm.io/gorm"

	"github.com/shopspring/decimal"
)

// groupOverviewMonths is how many months the overview's month list covers, ending with the period's last.
const groupOverviewMonths = 6

// groupOverviewMaxTrendMonths caps a long range's month trend, so a five-year range stays readable.
const groupOverviewMaxTrendMonths = 24

// groupOverviewMaxDays is the longest period accepted.
const groupOverviewMaxDays = 366 * 5

// A period shorter than this many days is drawn by day, a longer one by month.
const groupOverviewDailyTrendBelowDays = 28

const groupOverviewMonthLayout = "2006-01"

const (
	TrendUnitMonth = "MONTH"
	TrendUnitDay   = "DAY"
)

// ErrInvalidOverviewMonth is returned for a month that is not "yyyy-MM"; the handler maps it to a 400.
var ErrInvalidOverviewMonth = errors.New("month must be formatted yyyy-MM")

// ErrInvalidOverviewPeriod is returned for a from/to that is not a pair of yyyy-MM-dd days in order.
var ErrInvalidOverviewPeriod = errors.New("from and to must both be yyyy-MM-dd days, from on or before to, at most five years apart")

// GroupOverviewService builds the Dashboard's period at a glance. Like
// PieChartService, it loads the receipts through GetPagedReceiptsByGroupId, the only path that
// applies the "All" group fan-out, paid-by visibility and category/tag grants, and folds them in Go
// with shopspring/decimal, because SQLite has no decimal type to SUM exactly.
type GroupOverviewService struct {
	BaseService
}

func NewGroupOverviewService(tx *gorm.DB) GroupOverviewService {
	service := GroupOverviewService{BaseService: BaseService{
		DB: repositories.GetDB(),
		TX: tx,
	}}
	return service
}

// OverviewPeriod is a run of calendar days, inclusive, as midnight UTC (a receipt's Date is a
// calendar day stored that way).
type OverviewPeriod struct {
	From time.Time
	To   time.Time
}

func (period OverviewPeriod) days() int {
	return int(period.To.Sub(period.From).Hours()/24) + 1
}

// ResolveOverviewPeriod picks the days to describe: an explicit from/to wins; otherwise the month
// ("yyyy-MM"; empty means the current month in the app time zone).
func ResolveOverviewPeriod(month string, from string, to string, now time.Time) (OverviewPeriod, error) {
	if from != "" || to != "" {
		fromDay, fromErr := time.Parse(time.DateOnly, from)
		toDay, toErr := time.Parse(time.DateOnly, to)
		if fromErr != nil || toErr != nil || toDay.Before(fromDay) {
			return OverviewPeriod{}, ErrInvalidOverviewPeriod
		}

		period := OverviewPeriod{From: fromDay, To: toDay}
		if period.days() > groupOverviewMaxDays {
			return OverviewPeriod{}, ErrInvalidOverviewPeriod
		}

		return period, nil
	}

	monthStart, err := resolveOverviewMonth(month, now)
	if err != nil {
		return OverviewPeriod{}, err
	}

	return OverviewPeriod{From: monthStart, To: monthStart.AddDate(0, 1, -1)}, nil
}

// wholeMonths reports how many calendar months the period is, or 0 when it does not start on a first
// day and end on a last day.
func (period OverviewPeriod) wholeMonths() int {
	if period.From.Day() != 1 || period.To.AddDate(0, 0, 1).Day() != 1 {
		return 0
	}

	return (period.To.Year()-period.From.Year())*12 + int(period.To.Month()-period.From.Month()) + 1
}

// Previous is the period the figures are compared with: the same number of calendar months right
// before a whole-month period (so a month is compared with the month before, a year with the year
// before), otherwise the same number of days right before it.
func (period OverviewPeriod) Previous() OverviewPeriod {
	if months := period.wholeMonths(); months > 0 {
		return OverviewPeriod{From: period.From.AddDate(0, -months, 0), To: period.From.AddDate(0, 0, -1)}
	}

	days := period.days()
	to := period.From.AddDate(0, 0, -1)
	return OverviewPeriod{From: to.AddDate(0, 0, -(days - 1)), To: to}
}

// trendMonthStart is the first month the month trend (and the six-month list) needs receipts from.
func (period OverviewPeriod) trendMonthStart() time.Time {
	endMonth := time.Date(period.To.Year(), period.To.Month(), 1, 0, 0, 0, 0, time.UTC)
	spanned := (period.To.Year()-period.From.Year())*12 + int(period.To.Month()-period.From.Month()) + 1

	count := max(spanned, groupOverviewMonths)
	count = min(count, groupOverviewMaxTrendMonths)

	return endMonth.AddDate(0, -(count - 1), 0)
}

func (period OverviewPeriod) containsDay(day string) bool {
	return day >= period.From.Format(time.DateOnly) && day <= period.To.Format(time.DateOnly)
}

// GetGroupOverview describes month ("yyyy-MM"; empty means the current month in the app time zone).
func (service GroupOverviewService) GetGroupOverview(userId uint, groupId string, month string) (structs.GroupOverview, error) {
	return service.GetGroupOverviewForPeriod(userId, groupId, month, "", "")
}

// GetGroupOverviewForPeriod describes from..to (inclusive days) or, without them, the month, for the
// receipts the caller can see in the group, compared with the period before it. A receipt belongs to
// the day of its Date, read in UTC.
func (service GroupOverviewService) GetGroupOverviewForPeriod(userId uint, groupId string, month string, from string, to string) (structs.GroupOverview, error) {
	period, err := ResolveOverviewPeriod(month, from, to, time.Now())
	if err != nil {
		return structs.GroupOverview{}, err
	}
	previous := period.Previous()

	windowStart := earliest(previous.From, period.trendMonthStart())
	receipts, err := service.fetchReceipts(userId, groupId, windowStart, period.To)
	if err != nil {
		return structs.GroupOverview{}, err
	}

	periodProducts, err := repositories.NewReceiptProductRepository(service.TX).GetPricedProductsForReceipts(receiptIdsInPeriod(receipts, period))
	if err != nil {
		return structs.GroupOverview{}, err
	}
	err = service.nameProductCategories(periodProducts)
	if err != nil {
		return structs.GroupOverview{}, err
	}

	overview := foldGroupOverview(receipts, period, previous, groupProductsByReceipt(periodProducts))

	overview.UnhealthyTotal, overview.UnplannedTotal, err = service.sumProductKinds(receipts, period)
	if err != nil {
		return structs.GroupOverview{}, err
	}
	overview.PreviousUnhealthyTotal, overview.PreviousUnplannedTotal, err = service.sumProductKinds(receipts, previous)
	if err != nil {
		return structs.GroupOverview{}, err
	}

	overview.Tags, err = service.sumDashboardTags(receipts, period, previous)
	if err != nil {
		return structs.GroupOverview{}, err
	}

	overview.WarrantyCount, err = service.countActiveWarranties(userId, groupId)
	if err != nil {
		return structs.GroupOverview{}, err
	}

	return overview, nil
}

// countActiveWarranties counts what the Warranties list shows: the receipts the caller can see whose warranty ends
// today or later. It reads through GetPagedReceiptsByGroupId, so the same visibility rules apply.
func (service GroupOverviewService) countActiveWarranties(userId uint, groupId string) (int64, error) {
	permissionService := NewPermissionService(service.TX)

	pagedRequest := commands.ReceiptPagedRequestCommand{
		PagedRequestCommand: commands.PagedRequestCommand{
			Page:          1,
			PageSize:      1,
			OrderBy:       "warranty_until",
			SortDirection: commands.ASCENDING,
		},
		Filter: commands.ReceiptPagedRequestFilter{WarrantyActive: true},
	}

	_, count, err := repositories.NewReceiptRepository(service.TX).GetPagedReceiptsByGroupId(
		userId,
		groupId,
		pagedRequest,
		nil,
		permissionService.PaidByListResolver(userId),
		nil,
		permissionService.GroupPermissionResolver(userId, permissions.GroupReceiptsRead),
		permissionService.CategoryTagVisibilityResolver(userId),
	)
	return count, err
}

// nameProductCategories puts each product's current category name in FoodGroup, so a renamed category
// shows under its new name whatever the line still carries.
func (service GroupOverviewService) nameProductCategories(products []models.ReceiptProduct) error {
	categories, err := repositories.NewCategoryRepository(service.TX).GetAllCategories("id, name")
	if err != nil {
		return err
	}

	names := make(map[uint]string, len(categories))
	for _, category := range categories {
		names[category.ID] = category.Name
	}

	for i := range products {
		if products[i].CategoryId == nil {
			continue
		}
		if name, found := names[*products[i].CategoryId]; found {
			products[i].FoodGroup = name
		} else {
			products[i].CategoryId = nil
			products[i].FoodGroup = ""
		}
	}
	return nil
}

// sumDashboardTags builds the tiles of the tags shown on the Dashboard: what the priced product lines
// carrying each tag cost in the period and in the previous one, on the receipts the caller can see. A line
// with two such tags counts toward both tiles.
func (service GroupOverviewService) sumDashboardTags(receipts []models.Receipt, period OverviewPeriod, previous OverviewPeriod) ([]structs.GroupOverviewTag, error) {
	tiles := []structs.GroupOverviewTag{}

	tags := []models.Tag{}
	err := service.GetDB().Model(&models.Tag{}).Where("show_on_dashboard = ?", true).Order("name ASC").Find(&tags).Error
	if err != nil || len(tags) == 0 {
		return tiles, err
	}

	tagIds := make([]uint, len(tags))
	index := make(map[uint]int, len(tags))
	for i, tag := range tags {
		tagIds[i] = tag.ID
		index[tag.ID] = i
		tiles = append(tiles, structs.GroupOverviewTag{TagId: tag.ID, Name: tag.Name, Total: decimal.Zero, PreviousTotal: decimal.Zero})
	}

	repository := repositories.NewReceiptProductRepository(service.TX)

	rows, err := repository.GetPricedProductTags(receiptIdsInPeriod(receipts, period), tagIds)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		tiles[index[row.TagId]].Total = tiles[index[row.TagId]].Total.Add(row.Amount)
	}

	rows, err = repository.GetPricedProductTags(receiptIdsInPeriod(receipts, previous), tagIds)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		tiles[index[row.TagId]].PreviousTotal = tiles[index[row.TagId]].PreviousTotal.Add(row.Amount)
	}

	return tiles, nil
}

func earliest(a time.Time, b time.Time) time.Time {
	if b.Before(a) {
		return b
	}
	return a
}

func receiptIdsInPeriod(receipts []models.Receipt, period OverviewPeriod) []uint {
	ids := make([]uint, 0, len(receipts))
	for _, receipt := range receipts {
		if period.containsDay(receipt.Date.UTC().Format(time.DateOnly)) {
			ids = append(ids, receipt.ID)
		}
	}
	return ids
}

// sumProductKinds adds up the period's priced products rated unhealthy, and those marked as not on
// the shopping list, on the receipts the caller can see.
func (service GroupOverviewService) sumProductKinds(receipts []models.Receipt, period OverviewPeriod) (decimal.Decimal, decimal.Decimal, error) {
	unhealthy, unplanned := decimal.Zero, decimal.Zero

	receiptIds := receiptIdsInPeriod(receipts, period)
	if len(receiptIds) == 0 {
		return unhealthy, unplanned, nil
	}

	productRepository := repositories.NewReceiptProductRepository(service.TX)

	unhealthyProducts, err := productRepository.GetPricedProductsWithHealth(receiptIds, models.HEALTH_UNHEALTHY)
	if err != nil {
		return unhealthy, unplanned, err
	}
	for _, product := range unhealthyProducts {
		if product.Amount != nil {
			unhealthy = unhealthy.Add(*product.Amount)
		}
	}

	unplannedProducts, err := productRepository.GetPricedUnplannedProducts(receiptIds)
	if err != nil {
		return unhealthy, unplanned, err
	}
	for _, product := range unplannedProducts {
		if product.Amount != nil {
			unplanned = unplanned.Add(*product.Amount)
		}
	}

	return unhealthy, unplanned, nil
}

// GetOverviewProducts lists the product lines behind a Dashboard tile or slice for the period (see
// repositories.ProductKindFilter). Only products on receipts the caller can see, newest receipt first.
func (service GroupOverviewService) GetOverviewProducts(userId uint, groupId string, filter repositories.ProductKindFilter, month string, from string, to string) ([]structs.GroupOverviewProduct, error) {
	period, err := ResolveOverviewPeriod(month, from, to, time.Now())
	if err != nil {
		return nil, err
	}

	receipts, err := service.fetchReceipts(userId, groupId, period.From, period.To)
	if err != nil {
		return nil, err
	}

	byId := make(map[uint]models.Receipt, len(receipts))
	for _, receipt := range receipts {
		byId[receipt.ID] = receipt
	}

	products, err := repositories.NewReceiptProductRepository(service.TX).
		GetProductsForReceiptsByKind(receiptIdsInPeriod(receipts, period), filter)
	if err != nil {
		return nil, err
	}

	result := make([]structs.GroupOverviewProduct, 0, len(products))
	for _, product := range products {
		receipt := byId[product.ReceiptId]
		name := product.DisplayName
		if name == "" {
			name = product.Name
		}
		result = append(result, structs.GroupOverviewProduct{
			Id:          product.ID,
			ReceiptId:   product.ReceiptId,
			ReceiptName: receipt.Name,
			ReceiptDate: receipt.Date.UTC().Format(time.DateOnly),
			Name:        name,
			Amount:      product.Amount,
			Quantity:    product.Quantity,
			Health:      product.Health,
			Planned:     product.Planned,
		})
	}

	sort.SliceStable(result, func(i, j int) bool {
		if result[i].ReceiptDate != result[j].ReceiptDate {
			return result[i].ReceiptDate > result[j].ReceiptDate
		}
		return result[i].Id < result[j].Id
	})

	return result, nil
}

// resolveOverviewMonth returns midnight UTC on the first day of the month to describe.
func resolveOverviewMonth(month string, now time.Time) (time.Time, error) {
	if month == "" {
		appNow := now.In(repositories.GetAppLocation())
		return time.Date(appNow.Year(), appNow.Month(), 1, 0, 0, 0, 0, time.UTC), nil
	}

	parsed, err := time.Parse(groupOverviewMonthLayout, month)
	if err != nil {
		return time.Time{}, ErrInvalidOverviewMonth
	}

	return parsed, nil
}

func (service GroupOverviewService) fetchReceipts(
	userId uint,
	groupId string,
	from time.Time,
	to time.Time,
) ([]models.Receipt, error) {
	permissionService := NewPermissionService(service.TX)

	pagedRequest := commands.ReceiptPagedRequestCommand{
		PagedRequestCommand: commands.PagedRequestCommand{
			Page:          -1,
			PageSize:      -1,
			OrderBy:       "date",
			SortDirection: commands.DESCENDING,
		},
		Filter: commands.ReceiptPagedRequestFilter{
			Date: commands.PagedRequestField{
				Operation: commands.BETWEEN,
				Value:     []interface{}{from.Format(time.DateOnly), to.Format(time.DateOnly)},
			},
		},
	}

	receipts, _, err := repositories.NewReceiptRepository(service.TX).GetPagedReceiptsByGroupId(
		userId,
		groupId,
		pagedRequest,
		[]string{"Categories"},
		permissionService.PaidByListResolver(userId),
		nil,
		permissionService.GroupPermissionResolver(userId, permissions.GroupReceiptsRead),
		permissionService.CategoryTagVisibilityResolver(userId),
	)
	if err != nil {
		return nil, err
	}

	// Categories the caller may not see become a (Restricted) marker, so their spend shows as its
	// own slice rather than hiding among uncategorized receipts, as on the pie chart widget.
	err = permissionService.SubstituteRestrictedCategoriesTags(userId, receipts)
	if err != nil {
		return nil, err
	}

	return receipts, nil
}

// foldGroupOverview walks the receipts once. Every bucket of the trend is seeded first, so one
// without receipts renders as a zero bar rather than vanishing.
func foldGroupOverview(
	receipts []models.Receipt,
	period OverviewPeriod,
	previous OverviewPeriod,
	productsByReceipt map[uint][]models.ReceiptProduct,
) structs.GroupOverview {
	endMonth := time.Date(period.To.Year(), period.To.Month(), 1, 0, 0, 0, 0, time.UTC)
	trendMonthStart := period.trendMonthStart()

	monthTotals := map[string]decimal.Decimal{}
	for month := trendMonthStart; !month.After(endMonth); month = month.AddDate(0, 1, 0) {
		monthTotals[month.Format(groupOverviewMonthLayout)] = decimal.Zero
	}

	daily := period.days() < groupOverviewDailyTrendBelowDays
	dayTotals := map[string]decimal.Decimal{}
	if daily {
		for day := period.From; !day.After(period.To); day = day.AddDate(0, 0, 1) {
			dayTotals[day.Format(time.DateOnly)] = decimal.Zero
		}
	}

	overview := structs.GroupOverview{
		Month:                  period.From.Format(groupOverviewMonthLayout),
		From:                   period.From.Format(time.DateOnly),
		To:                     period.To.Format(time.DateOnly),
		PreviousFrom:           previous.From.Format(time.DateOnly),
		PreviousTo:             previous.To.Format(time.DateOnly),
		Total:                  decimal.Zero,
		PreviousTotal:          decimal.Zero,
		UnhealthyTotal:         decimal.Zero,
		PreviousUnhealthyTotal: decimal.Zero,
		UnplannedTotal:         decimal.Zero,
		PreviousUnplannedTotal: decimal.Zero,
	}
	overview.Tags = []structs.GroupOverviewTag{}
	categoryTotals := map[overviewCategoryKey]decimal.Decimal{}

	for _, receipt := range receipts {
		day := receipt.Date.UTC().Format(time.DateOnly)
		monthKey := receipt.Date.UTC().Format(groupOverviewMonthLayout)

		if total, inTrend := monthTotals[monthKey]; inTrend {
			monthTotals[monthKey] = total.Add(receipt.Amount)
		}

		if previous.containsDay(day) {
			overview.PreviousTotal = overview.PreviousTotal.Add(receipt.Amount)
			overview.PreviousReceiptCount++
		}

		if !period.containsDay(day) {
			continue
		}

		overview.Total = overview.Total.Add(receipt.Amount)
		overview.ReceiptCount++
		if daily {
			dayTotals[day] = dayTotals[day].Add(receipt.Amount)
		}
		// Everything a family reads as "To check" (Phase 3 C6).
		if receipt.Status == models.OPEN || receipt.Status == models.NEEDS_ATTENTION || receipt.Status == models.DRAFT {
			overview.OpenReceiptCount++
		}

		addReceiptToFoodGroups(categoryTotals, receipt, productsByReceipt[receipt.ID])
	}

	overview.Months = make([]structs.GroupOverviewMonth, 0, groupOverviewMonths)
	for i := 0; i < groupOverviewMonths; i++ {
		key := endMonth.AddDate(0, i-(groupOverviewMonths-1), 0).Format(groupOverviewMonthLayout)
		overview.Months = append(overview.Months, structs.GroupOverviewMonth{Month: key, Total: monthTotals[key]})
	}

	overview.Trend = make([]structs.GroupOverviewMonth, 0)
	if daily {
		overview.TrendUnit = TrendUnitDay
		for day := period.From; !day.After(period.To); day = day.AddDate(0, 0, 1) {
			key := day.Format(time.DateOnly)
			overview.Trend = append(overview.Trend, structs.GroupOverviewMonth{Month: key, Total: dayTotals[key]})
		}
	} else {
		overview.TrendUnit = TrendUnitMonth
		for month := trendMonthStart; !month.After(endMonth); month = month.AddDate(0, 1, 0) {
			key := month.Format(groupOverviewMonthLayout)
			overview.Trend = append(overview.Trend, structs.GroupOverviewMonth{Month: key, Total: monthTotals[key]})
		}
	}

	overview.Categories = make([]structs.GroupOverviewCategory, 0, len(categoryTotals))
	for key, total := range categoryTotals {
		category := structs.GroupOverviewCategory{Name: key.name, Total: total}
		if key.id != 0 {
			id := key.id
			category.CategoryId = &id
		}
		overview.Categories = append(overview.Categories, category)
	}
	// Largest first; ties by name, so the order never shuffles between requests.
	sort.Slice(overview.Categories, func(i, j int) bool {
		if cmp := overview.Categories[i].Total.Cmp(overview.Categories[j].Total); cmp != 0 {
			return cmp > 0
		}
		return overview.Categories[i].Name < overview.Categories[j].Name
	})

	return overview
}

const uncategorizedFoodGroup = "Uncategorized"

func groupProductsByReceipt(products []models.ReceiptProduct) map[uint][]models.ReceiptProduct {
	byReceipt := make(map[uint][]models.ReceiptProduct)
	for _, product := range products {
		byReceipt[product.ReceiptId] = append(byReceipt[product.ReceiptId], product)
	}
	return byReceipt
}

// foodGroupLabel is a product's food group as the Dashboard names it: "sweets & snacks" becomes
// "Sweets & Snacks", and a product with none is "Uncategorized".
func foodGroupLabel(foodGroup string) string {
	words := strings.Fields(foodGroup)
	if len(words) == 0 {
		return uncategorizedFoodGroup
	}
	for i, word := range words {
		runes := []rune(word)
		runes[0] = unicode.ToUpper(runes[0])
		words[i] = string(runes)
	}
	return strings.Join(words, " ")
}

// overviewCategoryKey is one slice of the Dashboard's category split: a category by id (its current name
// alongside), or, with id 0, a name only (Uncategorized, or a category deleted before ids were stored).
type overviewCategoryKey struct {
	id   uint
	name string
}

func productCategoryKey(product models.ReceiptProduct) overviewCategoryKey {
	if product.CategoryId != nil {
		return overviewCategoryKey{id: *product.CategoryId, name: product.FoodGroup}
	}
	return overviewCategoryKey{name: foodGroupLabel(product.FoodGroup)}
}

// addReceiptToFoodGroups spreads a receipt's spend over the categories of its product lines (Phase 3 3c,
// by category id since item-level categories): each priced line adds its amount to its category, and what
// the lines do not account for, or the whole amount of a receipt without products yet, lands in
// Uncategorized. Lines adding up to more than the receipt (a discount line) leave nothing over rather than
// going negative.
func addReceiptToFoodGroups(totals map[overviewCategoryKey]decimal.Decimal, receipt models.Receipt, products []models.ReceiptProduct) {
	accounted := decimal.Zero
	for _, product := range products {
		if product.Amount == nil {
			continue
		}
		key := productCategoryKey(product)
		totals[key] = totals[key].Add(*product.Amount)
		accounted = accounted.Add(*product.Amount)
	}

	rest := receipt.Amount.Sub(accounted)
	if len(products) == 0 || rest.IsPositive() {
		uncategorized := overviewCategoryKey{name: uncategorizedFoodGroup}
		totals[uncategorized] = totals[uncategorized].Add(rest)
	}
}
