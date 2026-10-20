package services

import (
	"errors"
	"sort"
	"time"

	"gorm.io/gorm"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/permissions"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/structs"

	"github.com/shopspring/decimal"
)

// groupOverviewMonths is how many months the overview's trend covers, ending with the chosen one.
const groupOverviewMonths = 6

const groupOverviewMonthLayout = "2006-01"

// ErrInvalidOverviewMonth is returned for a month that is not "yyyy-MM"; the handler maps it to a 400.
var ErrInvalidOverviewMonth = errors.New("month must be formatted yyyy-MM")

// GroupOverviewService builds the landing page's month at a glance. Like ReceiptSummaryService and
// PieChartService it loads the receipts through GetPagedReceiptsByGroupId — the only path that
// applies the "All" group fan-out, paid-by visibility and category/tag grants — and folds them in Go
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

// GetGroupOverview describes month ("yyyy-MM"; empty = the current month in the app time zone) for
// the receipts the caller can see in the group. A receipt's month is the month of its Date, a
// calendar day stored as midnight UTC, so it is read in UTC.
func (service GroupOverviewService) GetGroupOverview(userId uint, groupId string, month string) (structs.GroupOverview, error) {
	monthStart, err := resolveOverviewMonth(month, time.Now())
	if err != nil {
		return structs.GroupOverview{}, err
	}

	windowStart := monthStart.AddDate(0, -(groupOverviewMonths - 1), 0)
	monthEnd := monthStart.AddDate(0, 1, -1)

	receipts, err := service.fetchReceipts(userId, groupId, windowStart, monthEnd)
	if err != nil {
		return structs.GroupOverview{}, err
	}

	overview := foldGroupOverview(receipts, monthStart)

	overview.UnhealthyTotal, err = service.sumUnhealthy(receipts, overview.Month)
	if err != nil {
		return structs.GroupOverview{}, err
	}

	return overview, nil
}

// sumUnhealthy adds up the month's products rated unhealthy, on the receipts the caller can see.
func (service GroupOverviewService) sumUnhealthy(receipts []models.Receipt, month string) (decimal.Decimal, error) {
	receiptIds := make([]uint, 0, len(receipts))
	for _, receipt := range receipts {
		if receipt.Date.UTC().Format(groupOverviewMonthLayout) == month {
			receiptIds = append(receiptIds, receipt.ID)
		}
	}

	total := decimal.Zero
	if len(receiptIds) == 0 {
		return total, nil
	}

	products, err := repositories.NewReceiptProductRepository(service.TX).
		GetPricedProductsWithHealth(receiptIds, models.HEALTH_UNHEALTHY)
	if err != nil {
		return total, err
	}

	for _, product := range products {
		if product.Amount != nil {
			total = total.Add(*product.Amount)
		}
	}

	return total, nil
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
	// own slice rather than hiding among uncategorized receipts — as on the pie chart widget.
	err = permissionService.SubstituteRestrictedCategoriesTags(userId, receipts)
	if err != nil {
		return nil, err
	}

	return receipts, nil
}

// foldGroupOverview walks the receipts once. Every month of the window is seeded first, so one
// without receipts renders as a zero bar rather than vanishing.
func foldGroupOverview(receipts []models.Receipt, monthStart time.Time) structs.GroupOverview {
	month := monthStart.Format(groupOverviewMonthLayout)
	previousMonth := monthStart.AddDate(0, -1, 0).Format(groupOverviewMonthLayout)

	monthKeys := make([]string, groupOverviewMonths)
	monthTotals := make(map[string]decimal.Decimal, groupOverviewMonths)
	for i := 0; i < groupOverviewMonths; i++ {
		key := monthStart.AddDate(0, i-(groupOverviewMonths-1), 0).Format(groupOverviewMonthLayout)
		monthKeys[i] = key
		monthTotals[key] = decimal.Zero
	}

	overview := structs.GroupOverview{
		Month:          month,
		Total:          decimal.Zero,
		PreviousTotal:  decimal.Zero,
		UnhealthyTotal: decimal.Zero,
	}
	categoryTotals := map[string]decimal.Decimal{}

	for _, receipt := range receipts {
		key := receipt.Date.UTC().Format(groupOverviewMonthLayout)
		if _, inWindow := monthTotals[key]; !inWindow {
			continue
		}
		monthTotals[key] = monthTotals[key].Add(receipt.Amount)

		if key != month {
			continue
		}

		overview.ReceiptCount++
		// Everything a family reads as "To check" (Phase 3 C6).
		if receipt.Status == models.OPEN || receipt.Status == models.NEEDS_ATTENTION || receipt.Status == models.DRAFT {
			overview.OpenReceiptCount++
		}

		if len(receipt.Categories) == 0 {
			categoryTotals["Uncategorized"] = categoryTotals["Uncategorized"].Add(receipt.Amount)
			continue
		}
		for _, category := range receipt.Categories {
			categoryTotals[category.Name] = categoryTotals[category.Name].Add(receipt.Amount)
		}
	}

	overview.Total = monthTotals[month]
	if total, ok := monthTotals[previousMonth]; ok {
		overview.PreviousTotal = total
	}

	overview.Months = make([]structs.GroupOverviewMonth, 0, groupOverviewMonths)
	for _, key := range monthKeys {
		overview.Months = append(overview.Months, structs.GroupOverviewMonth{Month: key, Total: monthTotals[key]})
	}

	overview.Categories = make([]structs.GroupOverviewCategory, 0, len(categoryTotals))
	for name, total := range categoryTotals {
		overview.Categories = append(overview.Categories, structs.GroupOverviewCategory{Name: name, Total: total})
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

