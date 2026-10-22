package services

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"gorm.io/gorm"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/i18n"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/reporting"
	"cartvibe/api/internal/reporting/receiptsource"
	"cartvibe/api/internal/reporting/render"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
)

// ReportService turns a report-builder request into a downloadable report. It is
// the orchestrator the reporting engine's README calls for: it pulls the data
// (ReportDataService), assembles a spec, runs the pure engine, renders each
// requested format, and (for PDF) bridges the rendered HTML through the
// HTML-to-PDF service — the one place that may cross from the pure render package
// into the services layer. It reads the clock exactly once, at generation time.
type ReportService struct {
	BaseService
}

func NewReportService(tx *gorm.DB) ReportService {
	return ReportService{BaseService: BaseService{
		DB: repositories.GetDB(),
		TX: tx,
	}}
}

// GeneratedReport is a ready-to-stream report file: the bytes, a download
// filename, and the Content-Type to send with it.
type GeneratedReport struct {
	Bytes       []byte
	Filename    string
	ContentType string
}

// ReportPreview is the rendered HTML for the live builder preview plus the true
// number of receipts the current configuration covers (reported even when the
// rendered sample is capped). AllowedActions is populated only by the dashboard
// report-widget render path (RenderTemplateForUser) — it carries the actions the
// caller may perform on the template so the widget can gate its download button;
// the builder's own Preview leaves it nil (omitted).
type ReportPreview struct {
	Html           string   `json:"html"`
	ReceiptCount   int      `json:"receiptCount"`
	AllowedActions []string `json:"allowedActions,omitempty"`
}

// reportReceiptsCap bounds how many receipts the report drill-in lists. It is a
// sanity check, not the report: TotalCount still reports every covered receipt.
// It is the repository's page-size ceiling (BaseRepository.Paginate clamps any
// larger page to 100), since each group's newest receipts are fetched as one page.
const reportReceiptsCap = 100

// reportPreviewRowCap bounds how many receipt rows a preview feeds to the engine.
// A preview is a sample rendered on every builder edit (debounced), so beyond
// this many rows it truncates the sample to stay fast; ReceiptCount still reports
// the true total so the builder's "N receipts" chip is accurate. Normal
// period-bounded reports fall well under the cap and render in full.
const reportPreviewRowCap = 1000

// ReportSpecError wraps a failure to build or compile the report spec — a
// client-caused error (an unknown field key, a wrong-role column, a formula
// cycle) that the handler maps to a 400 rather than a 500.
type ReportSpecError struct {
	Err error
}

func (e *ReportSpecError) Error() string { return e.Err.Error() }
func (e *ReportSpecError) Unwrap() error { return e.Err }

// reportVariablePattern matches any of the four document variables the builder
// exposes, capturing the token name. It is applied in a single pass over the
// original text (see substituteVariables), so a substituted value is never
// re-scanned and the output does not depend on map iteration order.
var reportVariablePattern = regexp.MustCompile(`\{\{\s*(period|group\.name|generatedAt|currentUser\.name)\s*\}\}`)

var reportFilenameUnsafe = regexp.MustCompile(`[^\w]+`)

// Generate produces the report described by command for the given caller. The
// caller must already have been authorized (membership + group.reports.read in
// every group) — this service applies the reporting access controls per group but
// does not itself gate access.
func (service ReportService) Generate(userId uint, command commands.ReportRequestCommand) (GeneratedReport, error) {
	build, err := service.buildModel(userId, command, time.Now(), 0)
	if err != nil {
		return GeneratedReport{}, err
	}

	files, err := service.renderFormats(command.Formats, build.model, build.dimensions, build.chrome)
	if err != nil {
		return GeneratedReport{}, err
	}

	return service.assembleDownload(command.Name, files)
}

// Preview renders the report described by command as HTML for the live builder
// preview. It runs the same pipeline as Generate up through the engine — so the
// preview is the engine's own output, never a client-side approximation — but
// emits only HTML (no PDF bridge, no zip) and caps the rendered sample
// (reportPreviewRowCap). The same per-group authorization as Generate is the
// caller's responsibility.
func (service ReportService) Preview(userId uint, command commands.ReportRequestCommand) (ReportPreview, error) {
	return service.renderHTML(userId, command, reportPreviewRowCap)
}

// renderHTML runs the shared engine pipeline and renders the report as HTML. It
// backs both the row-capped builder preview (rowLimit = reportPreviewRowCap) and
// the dashboard report widget, which renders the full dataset (rowLimit = 0, like
// Generate). ReceiptCount is always the true pre-cap total.
func (service ReportService) renderHTML(userId uint, command commands.ReportRequestCommand, rowLimit int) (ReportPreview, error) {
	build, err := service.buildModel(userId, command, time.Now(), rowLimit)
	if err != nil {
		return ReportPreview{}, err
	}

	html, err := render.HTML(build.model, build.dimensions, build.chrome)
	if err != nil {
		return ReportPreview{}, err
	}

	return ReportPreview{Html: string(html), ReceiptCount: build.receiptCount}, nil
}

// reportBuild is the engine output plus the render inputs both Generate and
// Preview consume: the model, the group-by dimensions, the render-time document
// chrome, and the true receipt count.
type reportBuild struct {
	model        reporting.ReportModel
	dimensions   []render.Dimension
	chrome       render.DocumentChrome
	receiptCount int
}

// buildModel runs the shared pipeline both entry points need: resolve the period,
// load rows across every covered group under the one catalog, resolve the document
// variables, build the spec, and run the pure engine. rowLimit > 0 caps the
// receipts fed to the engine (for the preview sample); receiptCount is always the
// true pre-cap total. It reads the clock once, via the now passed in.
func (service ReportService) buildModel(
	userId uint,
	command commands.ReportRequestCommand,
	now time.Time,
	rowLimit int,
) (reportBuild, error) {
	settings, err := repositories.NewSystemSettingsRepository(service.TX).GetSystemSettings()
	if err != nil {
		return reportBuild{}, err
	}
	// The app time zone is resolved once per report, so the period, the row
	// buckets, the labels and the footer cannot disagree about it.
	location := repositories.ResolveAppLocation(settings.TimeZone)
	// The report reads in the language of the person generating it, whoever wrote the template.
	tr := service.readerLanguage(userId)

	filter, periodLabel := prepareReportFilter(userId, command, now, location, tr)

	catalog, rows, rowsPerReceipt, err := service.loadRows(userId, command.GroupIds, filter, lineDimensionsInUse(command), location, tr)
	if err != nil {
		return reportBuild{}, err
	}
	receiptCount := len(rowsPerReceipt)
	rows = capRowsToReceipts(rows, rowsPerReceipt, rowLimit)

	groupNames, err := service.groupNames(command.GroupIds)
	if err != nil {
		return reportBuild{}, err
	}

	title, chrome := service.resolveDocument(userId, groupNames, periodLabel, now.In(location), command.Name, command.Document, tr)

	spec, err := buildReportSpec(command)
	if err != nil {
		return reportBuild{}, &ReportSpecError{Err: err}
	}
	spec.Title = title
	spec.NoneLabel = tr.T("(None)")
	// A label a starter template stored in English reads in the language; one a person typed stays as typed.
	for index := range spec.Columns {
		spec.Columns[index].Label = tr.Data(spec.Columns[index].Label)
	}

	meta := reporting.MetaInput{
		GeneratedAt: now,
		Params: map[string]string{
			tr.T("Period"): periodLabel,
			tr.T("Groups"): strings.Join(groupNames, ", "),
		},
		Currency:   currencyFormat(settings),
		Location:   location,
		Translator: tr,
	}

	model, err := reporting.Run(spec, catalog, rows, meta)
	if err != nil {
		return reportBuild{}, &ReportSpecError{Err: err}
	}

	return reportBuild{
		model:        model,
		dimensions:   buildDimensions(spec.GroupBy, catalog, command.GroupByLabels, tr),
		chrome:       chrome,
		receiptCount: receiptCount,
	}, nil
}

// currencyFormat maps the app's System Settings currency configuration onto the
// engine's renderer hint, so every rendered format (the live preview included)
// presents money exactly as the rest of the UI does. It is always supplied — the
// settings row is a get-or-create singleton — so a report is never rendered with
// bare, symbol-less numbers.
func currencyFormat(settings models.SystemSettings) *reporting.CurrencyFormat {
	return &reporting.CurrencyFormat{
		Symbol:             settings.CurrencyDisplay,
		SymbolAtEnd:        settings.CurrencySymbolPosition == models.END,
		ThousandsSeparator: string(settings.CurrencyThousandthsSeparator),
		DecimalSeparator:   string(settings.CurrencyDecimalSeparator),
		HideDecimals:       settings.CurrencyHideDecimalPlaces,
	}
}

// prepareReportFilter copies the request's filter and applies what a report adds
// to it: the "report generator" paid-by sentinel becomes the caller, and the period
// becomes a BETWEEN on the receipt date it covers. The report and its receipts
// drill-in both start here, so they cover the same receipts.
//
// The period's presets ("this month", "last month") are worked out from now in
// the app's time zone, so a server running in UTC still agrees with the users
// on which month it is.
func prepareReportFilter(
	userId uint,
	command commands.ReportRequestCommand,
	now time.Time,
	location *time.Location,
	tr i18n.Translator,
) (commands.ReceiptPagedRequestFilter, string) {
	filter := command.Filter
	resolveReportGeneratorPaidBy(&filter, userId)
	periodLabel := applyPeriod(&filter, command.Period, now.In(location), tr)
	return filter, periodLabel
}

// Receipts lists the receipts the report described by command covers, for the
// Report Builder's drill-in. It resolves the filter and period exactly as the
// report does, on the server clock, and fetches through the same query, so the
// list agrees with the report's receipt count on every database; a browser
// resolving the period itself would land in its own time zone, and on SQLite its
// ISO bounds would compare as text against the stored timestamps. The same
// per-group authorization as Preview is the caller's responsibility.
func (service ReportService) Receipts(userId uint, command commands.ReportRequestCommand) (structs.PagedData, error) {
	return service.receipts(userId, command, time.Now())
}

func (service ReportService) receipts(
	userId uint,
	command commands.ReportRequestCommand,
	now time.Time,
) (structs.PagedData, error) {
	filter, _ := prepareReportFilter(userId, command, now, repositories.NewSystemSettingsRepository(service.TX).AppLocation(), i18n.English)
	dataService := NewReportDataService(service.TX)

	// Each group loads only its newest reportReceiptsCap receipts, which is enough:
	// the newest reportReceiptsCap overall are always among them. The total is the
	// sum of the groups' full counts, not of what was loaded.
	var receipts []models.Receipt
	var total int64
	for _, groupId := range command.GroupIds {
		groupReceipts, groupCount, err := dataService.Receipts(userId, groupId, filter, reportReceiptsCap)
		if err != nil {
			return structs.PagedData{}, err
		}
		receipts = append(receipts, groupReceipts...)
		total += groupCount
	}
	// Each group arrives newest first; keep that order across the groups.
	slices.SortStableFunc(receipts, func(a, b models.Receipt) int {
		return b.Date.Compare(a.Date)
	})

	if len(receipts) > reportReceiptsCap {
		receipts = receipts[:reportReceiptsCap]
	}
	data := make([]any, len(receipts))
	for index := range receipts {
		data[index] = receipts[index]
	}
	return structs.PagedData{Data: data, TotalCount: total}, nil
}

// loadRows gathers the engine rows across every covered group under a single
// catalog. The catalog is identical for each
// group; the rows are concatenated, as are the per-receipt row counts. The data
// service applies grant-narrowing on its own copy of the filter per group, so the
// caller's filter is reused unchanged.
func (service ReportService) loadRows(
	userId uint,
	groupIds []string,
	filter commands.ReceiptPagedRequestFilter,
	dimensions receiptsource.LineDimensions,
	location *time.Location,
	tr i18n.Translator,
) (reporting.FieldCatalog, []reporting.Row, []int, error) {
	dataService := NewReportDataService(service.TX)
	dataService.Location = location
	dataService.Translator = tr

	var catalog reporting.FieldCatalog
	var rows []reporting.Row
	var rowsPerReceipt []int
	for index, groupId := range groupIds {
		rowSet, err := dataService.RowsWithLines(userId, groupId, filter, dimensions)
		if err != nil {
			return reporting.FieldCatalog{}, nil, nil, err
		}
		if index == 0 {
			catalog = rowSet.Catalog
		}
		rows = append(rows, rowSet.Rows...)
		rowsPerReceipt = append(rowsPerReceipt, rowSet.RowsPerReceipt...)
	}
	return catalog, rows, rowsPerReceipt, nil
}

// capRowsToReceipts keeps the rows of the first limit receipts. It cuts on whole
// receipts, so a receipt divided by its lines is never partly in the sample;
// otherwise every receipt is one row and this is a plain row cap. limit <= 0
// keeps everything.
//
// The sample is deliberately the first receipts in loadRows' order — each group
// newest first, groups in GroupIds order — not the newest across all groups.
// That order is exactly what Generate renders (records-mode rows keep input
// order), so the capped preview stays a prefix of the real report rather than a
// different selection of it.
func capRowsToReceipts(rows []reporting.Row, rowsPerReceipt []int, limit int) []reporting.Row {
	if limit <= 0 || len(rowsPerReceipt) <= limit {
		return rows
	}

	end := 0
	for _, count := range rowsPerReceipt[:limit] {
		end += count
	}
	return rows[:end]
}

// lineDimensionsInUse says which line fields (category, tag, health, planned)
// the report cuts by: as a grouping level, or as the dimension an aggregate
// detail rolls up by. Only those divide a receipt by its lines; a line field used
// as a plain column just labels the receipt's row, since cutting there would
// change nothing a reader sees but the number of rows.
func lineDimensionsInUse(command commands.ReportRequestCommand) receiptsource.LineDimensions {
	keys := append([]string(nil), command.GroupBy...)
	if command.Detail.Mode == commands.ReportDetailAggregate {
		keys = append(keys, command.Detail.By)
	}
	return receiptsource.LineDimensionsFor(keys)
}

// renderedFile is one rendered format awaiting download assembly.
type renderedFile struct {
	extension   string
	contentType string
	bytes       []byte
}

// renderFormats renders the requested formats in a fixed order (CSV, XLSX, PDF)
// so multi-format bundles are deterministic regardless of request order.
func (service ReportService) renderFormats(
	formats []string,
	model reporting.ReportModel,
	dimensions []render.Dimension,
	chrome render.DocumentChrome,
) ([]renderedFile, error) {
	requested := make(map[string]bool, len(formats))
	for _, format := range formats {
		requested[format] = true
	}

	var files []renderedFile

	if requested[commands.ReportFormatCsv] {
		bytes, err := render.CSV(model, dimensions)
		if err != nil {
			return nil, err
		}
		files = append(files, renderedFile{commands.ReportFormatCsv, constants.TextCsv, bytes})
	}

	if requested[commands.ReportFormatXlsx] {
		bytes, err := render.XLSX(model, dimensions)
		if err != nil {
			return nil, err
		}
		files = append(files, renderedFile{commands.ReportFormatXlsx, constants.ApplicationXlsx, bytes})
	}

	if requested[commands.ReportFormatPdf] {
		html, err := render.HTML(model, dimensions, chrome)
		if err != nil {
			return nil, err
		}
		pdf, _, err := NewHtmlToPdfService(service.TX).Render(string(html))
		if err != nil {
			return nil, err
		}
		files = append(files, renderedFile{commands.ReportFormatPdf, constants.ApplicationPdf, pdf})
	}

	return files, nil
}

// assembleDownload returns a single file directly, or bundles several into a zip.
func (service ReportService) assembleDownload(name string, files []renderedFile) (GeneratedReport, error) {
	base := reportBaseName(name)

	if len(files) == 1 {
		return GeneratedReport{
			Bytes:       files[0].bytes,
			Filename:    base + "." + files[0].extension,
			ContentType: files[0].contentType,
		}, nil
	}

	names := make([]string, len(files))
	contents := make([][]byte, len(files))
	for index, file := range files {
		names[index] = base + "." + file.extension
		contents[index] = file.bytes
	}

	zipBytes, err := repositories.NewFileRepository(service.TX).ZipFiles(names, contents)
	if err != nil {
		return GeneratedReport{}, err
	}
	return GeneratedReport{
		Bytes:       zipBytes,
		Filename:    base + ".zip",
		ContentType: constants.ApplicationZip,
	}, nil
}

func (service ReportService) groupNames(groupIds []string) ([]string, error) {
	groupRepository := repositories.NewGroupRepository(service.TX)
	names := make([]string, 0, len(groupIds))
	for _, groupId := range groupIds {
		group, err := groupRepository.GetGroupById(groupId, false, false)
		if err != nil {
			return nil, err
		}
		names = append(names, group.Name)
	}
	return names, nil
}

// readerLanguage is the language the person generating a report chose for the app (Settings -> Language). It only
// reads: no preferences row, an empty or unknown language, or a failed read all give English, never an error.
func (service ReportService) readerLanguage(userId uint) i18n.Translator {
	var languages []*string
	err := service.GetDB().
		Model(&models.UserPrefernces{}).
		Where("user_id = ?", userId).
		Limit(1).
		Pluck("language", &languages).
		Error
	if err != nil || len(languages) == 0 || languages[0] == nil {
		return i18n.English
	}
	return i18n.For(*languages[0])
}

func (service ReportService) userDisplayName(userId uint, tr i18n.Translator) string {
	user, err := repositories.NewUserRepository(service.TX).GetUserById(userId)
	if err != nil {
		return tr.T("Unknown User")
	}
	if len(user.DisplayName) > 0 {
		return user.DisplayName
	}
	return user.Username
}

// buildReportSpec maps the request onto a reporting.ReportSpec (Title is resolved
// and set by the caller). Deep validity — field keys, roles, formula cycles — is
// left to reporting.Run.
func buildReportSpec(command commands.ReportRequestCommand) (reporting.ReportSpec, error) {
	groupBy := make([]reporting.FieldKey, len(command.GroupBy))
	for index, key := range command.GroupBy {
		groupBy[index] = reporting.FieldKey(key)
	}

	detail := reporting.DetailSpec{Mode: reporting.DetailRecords}
	if command.Detail.Mode == commands.ReportDetailAggregate {
		detail = reporting.DetailSpec{Mode: reporting.DetailAggregate, By: reporting.FieldKey(command.Detail.By)}
	}

	columns := make([]reporting.Column, 0, len(command.Columns))
	for _, column := range command.Columns {
		// A saved template may carry a dimension column that is currently
		// unresolvable — a label the engine can't place on an aggregated row
		// because its field is neither the aggregate dimension nor a grouping
		// level. The builder greys these out and leaves them out of the request;
		// the same projection here lets a template that stores one (so it
		// round-trips into the builder and re-enables when the config makes it
		// valid) still generate — with the column omitted — instead of failing
		// the whole report. Mirrors the desktop isDimensionColumnDisabled rule
		// and the engine's own compileLabelColumn rejection.
		if isDisabledDimensionColumn(command, column) {
			continue
		}

		built, err := buildReportColumn(column)
		if err != nil {
			return reporting.ReportSpec{}, err
		}
		columns = append(columns, built)
	}

	return reporting.ReportSpec{
		GroupBy:     groupBy,
		Detail:      detail,
		Columns:     columns,
		Subtotals:   command.Subtotals,
		GrandTotals: command.GrandTotals,
	}, nil
}

// isDisabledDimensionColumn reports whether a dimension column is unresolvable in
// aggregate mode — its field is neither the aggregate dimension nor a grouping
// level, so the engine cannot label an aggregated row with it. It is the
// server-side twin of the desktop builder's isDimensionColumnDisabled: such a
// column is projected out of the spec rather than failing the report, so a saved
// template may retain it for round-trip fidelity.
func isDisabledDimensionColumn(command commands.ReportRequestCommand, column commands.ReportColumn) bool {
	if command.Detail.Mode != commands.ReportDetailAggregate || column.Kind != commands.ReportColumnDimension {
		return false
	}
	return column.Field != command.Detail.By && !slices.Contains(command.GroupBy, column.Field)
}

func buildReportColumn(column commands.ReportColumn) (reporting.Column, error) {
	built := reporting.Column{Name: column.Name, Label: column.Label}
	switch column.Kind {
	case commands.ReportColumnDimension:
		built.Kind = reporting.ColumnLabel
		built.Field = reporting.FieldKey(column.Field)
	case commands.ReportColumnAggregate:
		built.Kind = reporting.ColumnAggregate
		built.AggSrc = aggregateSource(column.AggFunc, column.Measure)
	case commands.ReportColumnFormula:
		built.Kind = reporting.ColumnArithmetic
		built.Expr = column.Expr
	default:
		return reporting.Column{}, fmt.Errorf("unknown column kind %q", column.Kind)
	}
	return built, nil
}

// aggregateSource renders an aggregate into the engine's source form, e.g.
// "SUM(amount)" or "COUNT()".
func aggregateSource(aggFunc string, measure string) string {
	if aggFunc == "COUNT" {
		return "COUNT()"
	}
	return aggFunc + "(" + measure + ")"
}

// buildDimensions mirrors the spec's group-by into render dimensions, pulling each
// heading label and data type from the catalog. The data type is what lets a
// renderer present a bucket — a boolean as Yes/No, a date as a calendar day,
// money per the report's currency configuration — instead of dumping the engine's
// raw value. A key the catalog does not know falls back to the key as its own
// heading and to plain text, which is what an unresolvable dimension can offer.
func buildDimensions(groupBy []reporting.FieldKey, catalog reporting.FieldCatalog, labels map[string]string, tr i18n.Translator) []render.Dimension {
	dimensions := make([]render.Dimension, len(groupBy))
	for index, key := range groupBy {
		dimension := render.Dimension{Key: key, Label: string(key)}
		if field, ok := catalog.Get(key); ok {
			dimension.Label = field.Label
			dimension.DataType = field.DataType
			dimension.Location = field.Location
		}
		// A grouping level renders as a leading column, and the request may name
		// that column itself. A blank override means "use the catalog label", and
		// a key naming no grouping level is simply never looked up — a stale
		// entry must not fail an otherwise valid report.
		if override := strings.TrimSpace(labels[string(key)]); len(override) > 0 {
			dimension.Label = tr.Data(override)
		}
		dimensions[index] = dimension
	}
	return dimensions
}

// reportGeneratorPaidBySentinel is the paid-by filter value the desktop report builder
// stores for its "Whoever generates the report" option (desktop
// REPORT_GENERATOR_PAID_BY_ID). It is negative so it can never collide with a real
// (positive) user id.
const reportGeneratorPaidBySentinel = -1

// resolveReportGeneratorPaidBy substitutes the report-generator sentinel in the paid-by
// filter with the id of the user generating the report, so a saved template stays
// dynamic — whoever runs it filters to their own receipts, regardless of who authored
// it. It runs before the query is built (BuildGormFilterQuery otherwise passes the raw
// -1 straight into `paid_by_user_id IN (...)`), covering both Generate and Preview
// since both funnel through buildModel. A fresh slice is built so the caller's command
// is never mutated. Values arrive as float64 (JSON) and are matched/substituted as
// such, matching how a static user-id filter already flows through the same IN clause.
func resolveReportGeneratorPaidBy(filter *commands.ReceiptPagedRequestFilter, userId uint) {
	values, ok := filter.PaidBy.Value.([]interface{})
	if !ok {
		return
	}

	resolved := make([]interface{}, 0, len(values))
	for _, value := range values {
		if id, isNumber := value.(float64); isNumber && id == reportGeneratorPaidBySentinel {
			resolved = append(resolved, float64(userId))
		} else {
			resolved = append(resolved, value)
		}
	}
	filter.PaidBy.Value = resolved
}

// applyPeriod resolves the request's period into an inclusive range of calendar
// days, writes it onto the filter slot of the receipt date the period covers
// (overwriting any condition already there), and returns a human-readable label
// for the document preamble and the {{period}} variable. Presets are computed
// from now, which the caller has already put in the app's time zone; custom uses
// the supplied bounds (already validated by the command). A date field the
// filter has no slot for falls back to the receipt date: the stored-template
// paths run a configuration without re-validating it, so this stays lenient like
// resolvePeriodBounds' default.
//
// The bounds are written as bare calendar days ("2006-01-02"), not instants.
// Which instants a day covers depends on the column — a receipt's Date is a UTC
// calendar day, Added At and Resolved Date are app-zone instants — and the
// receipt filter's day builder (BuildDayFilterQuery) is the one place that knows
// that, so the period, the receipts table and the drill-in cannot disagree.
func applyPeriod(filter *commands.ReceiptPagedRequestFilter, period commands.ReportPeriod, now time.Time, tr i18n.Translator) string {
	start, end := resolvePeriodBounds(period, now)

	startDay := start.Format(time.DateOnly)
	endDay := end.Format(time.DateOnly)

	field := filter.DateFilterField(period.DateFilterKey())
	if field == nil {
		field = &filter.Date
	}
	*field = commands.PagedRequestField{
		Operation: commands.BETWEEN,
		Value:     []interface{}{startDay, endDay},
	}

	return tr.T("{start} to {end}", "start", startDay, "end", endDay)
}

func resolvePeriodBounds(period commands.ReportPeriod, now time.Time) (time.Time, time.Time) {
	firstOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	switch period.Preset {
	case commands.ReportPeriodThisMonth:
		return firstOfMonth, firstOfMonth.AddDate(0, 1, -1)
	case commands.ReportPeriodLastMonth:
		lastMonth := firstOfMonth.AddDate(0, -1, 0)
		return lastMonth, firstOfMonth.AddDate(0, 0, -1)
	case commands.ReportPeriodMtd:
		return firstOfMonth, now
	case commands.ReportPeriodQtd:
		quarterStartMonth := ((int(now.Month()) - 1) / 3 * 3) + 1
		return time.Date(now.Year(), time.Month(quarterStartMonth), 1, 0, 0, 0, 0, now.Location()), now
	case commands.ReportPeriodYtd:
		return time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location()), now
	case commands.ReportPeriodCustom:
		// The command validated these parse; ignoring the error keeps a bad bound
		// from becoming a zero time — which the validator already rejected.
		start, _ := time.Parse("2006-01-02", period.StartDate)
		end, _ := time.Parse("2006-01-02", period.EndDate)
		return start, end
	default:
		return firstOfMonth, now
	}
}

// resolveDocument substitutes the four report variables into the authored
// document copy, returning the resolved title (for the model's Meta) and the
// render-time chrome (intro and footer). The runtime values it resolves — the
// period label, the covered group names, the generation time, and the caller's
// display name — are known only here, at generation time. The visible heading is
// the authored document title; when it is left blank it falls back to the report
// name so the rendered report (and its live preview) is never headingless.
func (service ReportService) resolveDocument(
	userId uint,
	groupNames []string,
	periodLabel string,
	now time.Time,
	name string,
	document commands.ReportDocument,
	tr i18n.Translator,
) (string, render.DocumentChrome) {
	substitutions := map[string]string{
		"period":           periodLabel,
		"group.name":       strings.Join(groupNames, ", "),
		"generatedAt":      tr.DateTime(now),
		"currentUser.name": service.userDisplayName(userId, tr),
	}
	titleSource := document.Title
	if strings.TrimSpace(titleSource) == "" {
		titleSource = name
	}
	// Copy a starter template stored in English (title, intro, footer) reads in the language before its
	// variables are filled in; copy a person wrote is used as written.
	return substituteVariables(tr.Data(titleSource), substitutions),
		render.DocumentChrome{
			Intro:  substituteVariables(tr.Data(document.Intro), substitutions),
			Footer: substituteVariables(tr.Data(document.Footer), substitutions),
		}
}

// substituteVariables replaces the supported document variables in text with
// their resolved values in a single pass over the original text. A resolved value
// that itself contains a token is never re-scanned, and unknown tokens (which the
// pattern does not match) are left untouched.
func substituteVariables(text string, values map[string]string) string {
	return reportVariablePattern.ReplaceAllStringFunc(text, func(match string) string {
		token := reportVariablePattern.FindStringSubmatch(match)[1]
		return values[token]
	})
}

// reportBaseName sanitizes a report name into a filesystem-safe download stem,
// falling back to "report" when nothing usable remains.
func reportBaseName(name string) string {
	base := strings.Trim(reportFilenameUnsafe.ReplaceAllString(name, "_"), "_")
	if base == "" {
		return "report"
	}
	return base
}
