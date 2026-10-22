package services

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/reporting"
	"cartvibe/api/internal/reporting/receiptsource"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"gorm.io/gorm"
	"time"
)

// ReportDataService resolves a group's receipts into the reporting engine's two
// inputs — a field catalog and the rows — with the reporting access controls
// applied. It is the only place that reads the database for a report; the engine
// itself fetches nothing and enforces nothing.
//
// It stops at the engine's inputs: it does not build a ReportSpec or call
// reporting.Run. A caller assembles the spec and runs the report.
type ReportDataService struct {
	BaseService

	// Location is the app time zone the rows' instants (Added At, Resolved
	// Date) are bucketed in. Nil reads it from System Settings when rows are
	// built; ReportService sets it so one report resolves the zone once.
	Location *time.Location
}

func NewReportDataService(tx *gorm.DB) ReportDataService {
	service := ReportDataService{BaseService: BaseService{
		DB: repositories.GetDB(),
		TX: tx,
	}}
	return service
}

// Rows fetches a group's receipts, applies the three reporting access controls,
// and maps the survivors to engine rows, one per receipt. The controls run in the
// order they must:
//
//   - the request filter is narrowed to what the caller may see, so a restricted
//     caller cannot probe for hidden categories/tags through the filter;
//   - paid-by visibility is enforced in the query, so a receipt the caller may
//     not see is never fetched (whole-receipt hiding);
//   - line categories/tags the caller may not see read as (Restricted), so their
//     spend still counts toward the totals in its own bucket rather than vanishing.
//
// The returned catalog carries every built-in field.
func (service ReportDataService) Rows(userId uint, groupId string, filter commands.ReceiptPagedRequestFilter) (reporting.FieldCatalog, []reporting.Row, error) {
	rowSet, err := service.RowsWithLines(userId, groupId, filter, receiptsource.LineDimensions{})
	if err != nil {
		return reporting.FieldCatalog{}, nil, err
	}
	return rowSet.Catalog, rowSet.Rows, nil
}

// ReportRowSet is what RowsWithLines returns: the engine's catalog and rows, and
// how many rows each fetched receipt became. Without a line dimension every
// receipt is one row; with one, a receipt becomes a row per bucket its lines fall
// into, which is why a receipt count cannot be read off len(Rows).
type ReportRowSet struct {
	Catalog        reporting.FieldCatalog
	Rows           []reporting.Row
	RowsPerReceipt []int
}

// RowsWithLines is Rows reading Category, Tag, Health and Planned off the
// receipts' product lines (receiptsource.Source.RowsWithLines). When the report
// cuts by one of them, a receipt is divided by its lines' amounts.
//
// A hidden category or tag becomes (Restricted) on the line itself, so the
// division is the same for every viewer: a visible category's share never
// depends on who is looking, and (Restricted) receives exactly the hidden lines.
func (service ReportDataService) RowsWithLines(
	userId uint,
	groupId string,
	filter commands.ReceiptPagedRequestFilter,
	dimensions receiptsource.LineDimensions,
) (ReportRowSet, error) {
	location := service.Location
	if location == nil {
		location = repositories.NewSystemSettingsRepository(service.TX).AppLocation()
	}

	source, err := receiptsource.New(location)
	if err != nil {
		return ReportRowSet{}, err
	}

	receipts, _, err := service.fetchReceipts(userId, groupId, filter, []string{"PaidByUser", "Group"}, -1)
	if err != nil {
		return ReportRowSet{}, err
	}

	lines, err := service.reportLines(userId, receipts)
	if err != nil {
		return ReportRowSet{}, err
	}

	rows, rowsPerReceipt := source.RowsWithLines(receipts, lines, dimensions)

	return ReportRowSet{
		Catalog:        source.Catalog(),
		Rows:           rows,
		RowsPerReceipt: rowsPerReceipt,
	}, nil
}

// reportLines loads the receipts' priced product lines as the report source reads
// them, parallel to receipts: the category's current name, the tag names, and
// (Restricted) for a category or tag the caller may not see in the receipt's
// group. A line whose category was deleted reads as Uncategorized.
func (service ReportDataService) reportLines(userId uint, receipts []models.Receipt) ([][]receiptsource.Line, error) {
	lines := make([][]receiptsource.Line, len(receipts))
	if len(receipts) == 0 {
		return lines, nil
	}

	receiptIds := make([]uint, 0, len(receipts))
	indexById := make(map[uint]int, len(receipts))
	for index, receipt := range receipts {
		receiptIds = append(receiptIds, receipt.ID)
		indexById[receipt.ID] = index
	}

	products, err := repositories.NewReceiptProductRepository(service.TX).GetReportLinesForReceipts(receiptIds)
	if err != nil {
		return nil, err
	}

	categoryNames, err := service.categoryNames(products)
	if err != nil {
		return nil, err
	}

	grantFilter, err := NewPermissionService(service.TX).newReceiptGrantFilter(userId)
	if err != nil {
		return nil, err
	}

	for _, product := range products {
		index, found := indexById[product.ReceiptId]
		if !found || product.Amount == nil {
			continue
		}
		grants, err := grantFilter.grantsForGroup(receipts[index].GroupId)
		if err != nil {
			return nil, err
		}

		line := receiptsource.Line{
			Amount:  *product.Amount,
			Health:  product.Health,
			Planned: product.Planned,
		}
		if product.CategoryId != nil {
			line.Category = categoryNames[*product.CategoryId]
			if !grantFilter.bypassCategories && !grants.categoryUnrestricted {
				if _, allowed := grants.categoryAllowed[*product.CategoryId]; !allowed {
					line.Category = restrictedCategoryTagName
				}
			}
		}
		for _, tag := range product.Tags {
			name := tag.Name
			if !grantFilter.bypassTags && !grants.tagUnrestricted {
				if _, allowed := grants.tagAllowed[tag.ID]; !allowed {
					name = restrictedCategoryTagName
				}
			}
			line.Tags = append(line.Tags, name)
		}

		lines[index] = append(lines[index], line)
	}

	return lines, nil
}

// categoryNames reads the current names of the products' categories, so a
// renamed category reports under its new name.
func (service ReportDataService) categoryNames(products []models.ReceiptProduct) (map[uint]string, error) {
	ids := make([]uint, 0)
	seen := make(map[uint]struct{})
	for _, product := range products {
		if product.CategoryId == nil {
			continue
		}
		if _, exists := seen[*product.CategoryId]; exists {
			continue
		}
		seen[*product.CategoryId] = struct{}{}
		ids = append(ids, *product.CategoryId)
	}

	names := make(map[uint]string, len(ids))
	if len(ids) == 0 {
		return names, nil
	}

	categories, err := repositories.NewCategoryRepository(service.TX).GetByIds(ids)
	if err != nil {
		return nil, err
	}
	for _, category := range categories {
		names[category.ID] = category.Name
	}
	return names, nil
}

// Receipts fetches the same receipts Rows turns into report rows, for a caller
// that lists them rather than reporting on them (the Report Builder's drill-in):
// at most limit of them, newest first, plus the count of every receipt that
// matched. Sharing fetchReceipts is what keeps the list and the report's count in
// step. Where the two differ is presentation, and there it follows the receipts
// list: user references are masked for member visibility.
func (service ReportDataService) Receipts(
	userId uint,
	groupId string,
	filter commands.ReceiptPagedRequestFilter,
	limit int,
) ([]models.Receipt, int64, error) {
	permissionService := NewPermissionService(service.TX)

	receipts, count, err := service.fetchReceipts(userId, groupId, filter, nil, limit)
	if err != nil {
		return nil, 0, err
	}
	if err := permissionService.MaskReceiptsForMemberVisibility(userId, receipts); err != nil {
		return nil, 0, err
	}
	return receipts, count, nil
}

// fetchReceipts loads a group's receipts matching the filter, newest first, with
// the two controls that decide which receipts a caller may see at all: the filter
// is narrowed to the caller's category/tag grants, so a restricted caller cannot
// probe for hidden ones through it, and paid-by visibility is enforced in the
// query, so a receipt the caller may not see is never fetched. A limit above zero
// loads only that many; the returned count is every receipt the query matched,
// taken after both controls, so it holds either way. A limit of -1 loads them all.
func (service ReportDataService) fetchReceipts(
	userId uint,
	groupId string,
	filter commands.ReceiptPagedRequestFilter,
	associations []string,
	limit int,
) ([]models.Receipt, int64, error) {
	receiptRepository := repositories.NewReceiptRepository(service.TX)
	permissionService := NewPermissionService(service.TX)

	uintGroupId, err := utils.StringToUint(groupId)
	if err != nil {
		return nil, 0, err
	}

	page := -1
	if limit > 0 {
		page = 1
	}
	pagedRequest := commands.ReceiptPagedRequestCommand{
		PagedRequestCommand: commands.PagedRequestCommand{
			Page:          page,
			PageSize:      limit,
			OrderBy:       "date",
			SortDirection: commands.DESCENDING,
		},
		Filter: filter,
	}

	if err := permissionService.IntersectReceiptFilterWithGrants(userId, uintGroupId, &pagedRequest.Filter); err != nil {
		return nil, 0, err
	}

	// For the synthetic All group, gate expansion to the groups the caller may
	// read reports in and scope any category/tag filter per group. Both resolvers
	// must be passed together (GetPagedReceiptsByGroupId fails closed otherwise).
	// Shared by Rows and Receipts, so both report paths get the same gate; a
	// single-group read never consults them.
	return receiptRepository.GetPagedReceiptsByGroupId(
		userId,
		groupId,
		pagedRequest,
		associations,
		permissionService.PaidByListResolver(userId),
		nil,
		permissionService.GroupPermissionResolver(userId, permissions.GroupReportsRead),
		permissionService.CategoryTagVisibilityResolver(userId),
	)
}
