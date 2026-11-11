package backup

import (
	"cmp"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"

	"github.com/shopspring/decimal"
)

// maxProblems caps the problems a preview lists; the rest are counted.
const maxProblems = 50

// Household is an export read back into models. Every id in it is the exporting server's own (a
// source id); the import gives each row a new id and rewrites the references.
type Household struct {
	Manifest Manifest

	Users          []models.User
	UserRoles      map[uint]string
	Groups         []models.Group
	Members        []SourceMember
	Categories     []models.Category
	Tags           []models.Tag
	Lists          []models.ShoppingList
	Items          []models.ShoppingListItem
	Receipts       []models.Receipt
	ReceiptCats    []IdPair
	ReceiptTags    []IdPair
	Products       []models.ReceiptProduct
	ProductTags    []IdPair
	// OldComments are the rows of comments.csv, which only an export made before 2026-11 has (a receipt had a
	// thread of comments then). Parse joins them into each receipt's Note; nothing else reads them.
	OldComments []SourceComment
	Files       []SourceFile
	Trips          []SourceTrip
	Overrides      []models.ProductClassificationOverride
	Rates          []models.ExchangeRate
	Templates      []models.ReportTemplate
	TemplateGroups []IdPair
	Preferences    []models.UserPrefernces
	Layouts        []models.DashboardLayout
	GroupSettings  []models.GroupReceiptSettings

	// Problems are rows that cannot be imported, as "file row N column: reason".
	Problems     []string
	problemCount int
}

type SourceMember struct {
	UserId  uint
	GroupId uint
	Role    string
}

type IdPair struct {
	Left  uint
	Right uint
}

type SourceFile struct {
	models.FileData
	Entry string
}

// SourceComment is one comment of an older export.
type SourceComment struct {
	ID        uint
	ReceiptId uint
	UserId    *uint
	Text      string
	CreatedAt time.Time
}

type SourceTrip struct {
	models.ShoppingTrip
	Photo string
}

// ProblemCount is how many problems were found, also beyond the ones listed.
func (household *Household) ProblemCount() int {
	return household.problemCount
}

func (household *Household) addProblem(problem string) {
	household.problemCount++
	if len(household.Problems) < maxProblems {
		household.Problems = append(household.Problems, problem)
	}
}

// Parse reads every table of a verified archive. A cell that cannot be read is a problem, not an
// error: the preview lists them and the import refuses to start while there are any.
func Parse(archive *Archive) (*Household, error) {
	household := &Household{Manifest: archive.Manifest, UserRoles: map[uint]string{}, Problems: []string{}}

	read := func(table string, each func(c cells)) error {
		rows, err := archive.Table(table)
		if err != nil {
			return err
		}
		for index, row := range rows {
			// Line 1 is the header.
			each(cells{table: table, line: index + 2, row: row, household: household})
		}
		return nil
	}

	steps := []struct {
		table string
		each  func(c cells)
	}{
		{"users", func(c cells) {
			user := models.User{BaseModel: c.base(), Username: strings.TrimSpace(c.text("username")), DisplayName: c.text("display_name"),
				DefaultAvatarColor: c.text("default_avatar_color"), IsDummyUser: c.boolean("is_dummy_user")}
			if user.Username == "" {
				c.fail("username", "is empty")
			}
			household.UserRoles[user.ID] = c.text("app_role")
			household.Users = append(household.Users, user)
		}},
		{"groups", func(c cells) {
			group := models.Group{BaseModel: c.base(), Name: c.text("name"), IsDefaultGroup: c.boolean("is_default_group"),
				Status: models.GroupStatus(c.text("status"))}
			if !utils.IsSafePathComponent(group.Name) || strings.ContainsAny(group.Name, `/\`) {
				c.fail("name", "is not a usable household name")
			}
			if group.Status == "" {
				group.Status = models.GROUP_ACTIVE
			}
			household.Groups = append(household.Groups, group)
		}},
		{"group_members", func(c cells) {
			household.Members = append(household.Members, SourceMember{UserId: c.id("user_id"), GroupId: c.id("group_id"), Role: c.text("group_role")})
		}},
		{"categories", func(c cells) {
			category := models.Category{BaseModel: c.base(), Name: strings.TrimSpace(c.text("name")), Description: c.text("description"),
				Skipped: c.boolean("skipped"), Aliases: c.text("aliases")}
			if category.Name == "" {
				c.fail("name", "is empty")
			}
			household.Categories = append(household.Categories, category)
		}},
		{"tags", func(c cells) {
			tag := models.Tag{BaseModel: c.base(), Name: strings.TrimSpace(c.text("name")), Description: c.text("description"),
				ShowOnDashboard: c.boolean("show_on_dashboard")}
			if tag.Name == "" {
				c.fail("name", "is empty")
			}
			household.Tags = append(household.Tags, tag)
		}},
		{"shopping_lists", func(c cells) {
			household.Lists = append(household.Lists, models.ShoppingList{BaseModel: c.base(), GroupId: c.id("group_id"), Name: c.text("name")})
		}},
		{"shopping_list_items", func(c cells) {
			item := models.ShoppingListItem{BaseModel: c.base(), ShoppingListId: c.id("shopping_list_id"), Name: c.text("name"),
				Amount: c.decimalPtr("amount"), Unit: c.text("unit"), Quantity: c.text("quantity"), Note: c.text("note"),
				IsChecked: c.boolean("is_checked"), CheckedAt: c.instantPtr("checked_at"), CheckedByUserId: c.idPtr("checked_by_user_id"),
				FoodClassification: c.classification()}
			if item.Unit != "" && !slices.Contains(models.ShoppingListUnits, item.Unit) {
				c.fail("unit", "is not a known unit")
			}
			household.Items = append(household.Items, item)
		}},
		{"receipts", func(c cells) {
			receipt := models.Receipt{BaseModel: c.base(), GroupId: c.id("group_id"), Name: c.text("name"), ShopName: c.text("shop_name"),
				Date: c.day("date"), Amount: c.decimal("amount"), OriginalAmount: c.decimalPtr("original_amount"),
				OriginalCurrency: c.text("original_currency"), ExchangeRate: c.decimalPtr("exchange_rate"),
				// A file from before the two statuses may name a removed one.
				WarrantyUntil: c.dayTextPtr("warranty_until"), Status: models.NormalizeReceiptStatus(models.ReceiptStatus(c.text("status"))),
				ResolvedDate: c.instantPtr("resolved_date"), PaidByUserID: c.id("paid_by_user_id"), Note: c.text("note")}
			if receipt.Status == "" {
				receipt.Status = models.OPEN
			}
			if !slices.Contains(models.ReceiptStatuses(), any(receipt.Status)) {
				c.fail("status", "is not a known status")
			}
			household.Receipts = append(household.Receipts, receipt)
		}},
		{"receipt_categories", func(c cells) {
			household.ReceiptCats = append(household.ReceiptCats, IdPair{c.id("receipt_id"), c.id("category_id")})
		}},
		{"receipt_tags", func(c cells) {
			household.ReceiptTags = append(household.ReceiptTags, IdPair{c.id("receipt_id"), c.id("tag_id")})
		}},
		{"receipt_products", func(c cells) {
			household.Products = append(household.Products, models.ReceiptProduct{BaseModel: c.base(), ReceiptId: c.id("receipt_id"),
				Position: c.number("position"), Name: c.text("name"), DisplayName: c.text("display_name"), Quantity: c.text("quantity"),
				Amount: c.decimalPtr("amount"), CategoryId: c.idPtr("category_id"), CategoryOverridden: c.boolean("category_overridden"),
				Planned: c.boolPtr("planned"), MatchedShoppingListItemId: c.idPtr("matched_shopping_list_item_id"),
				FoodClassification: c.classification()})
		}},
		{"receipt_product_tags", func(c cells) {
			household.ProductTags = append(household.ProductTags, IdPair{c.id("receipt_product_id"), c.id("tag_id")})
		}},
		// Only in an export from before a receipt had a note; see Household.OldComments.
		{"comments", func(c cells) {
			household.OldComments = append(household.OldComments, SourceComment{ID: c.id("id"), ReceiptId: c.id("receipt_id"),
				UserId: c.idPtr("user_id"), Text: c.text("comment"), CreatedAt: c.instant("created_at")})
		}},
		{"files", func(c cells) {
			file := SourceFile{FileData: models.FileData{BaseModel: c.base(), ReceiptId: c.id("receipt_id"), Name: c.text("name"),
				FileType: c.text("file_type"), Size: uint(c.number("size"))}, Entry: c.text("file")}
			if !utils.IsSafePathComponent(file.Name) || strings.ContainsAny(file.Name, `/\`) {
				c.fail("name", "is not a usable file name")
			}
			household.Files = append(household.Files, file)
		}},
		{"shopping_trips", func(c cells) {
			household.Trips = append(household.Trips, SourceTrip{ShoppingTrip: models.ShoppingTrip{BaseModel: c.base(),
				ShoppingListId: c.id("shopping_list_id"), ReceiptId: c.idPtr("receipt_id"), Status: models.ShoppingTripStatus(c.text("status")),
				PlannedItems: c.text("planned_items"), PhotoName: c.text("photo_name"), LastError: c.text("last_error")}, Photo: c.text("photo")})
		}},
		{"classification_overrides", func(c cells) {
			household.Overrides = append(household.Overrides, models.ProductClassificationOverride{GroupId: c.id("group_id"),
				NormalizedName: c.text("normalized_name"), Health: c.text("health")})
		}},
		{"exchange_rates", func(c cells) {
			household.Rates = append(household.Rates, models.ExchangeRate{Code: c.text("code"), Rate: c.decimalPtr("rate")})
		}},
		{"report_templates", func(c cells) {
			version := c.number("configuration_version")
			if version == 0 {
				version = 1
			}
			household.Templates = append(household.Templates, models.ReportTemplate{BaseModel: c.base(), Name: c.text("name"),
				Configuration: []byte(c.text("configuration")), ConfigurationVersion: version})
		}},
		{"report_template_groups", func(c cells) {
			household.TemplateGroups = append(household.TemplateGroups, IdPair{c.id("report_template_id"), c.id("group_id")})
		}},
		{"user_preferences", func(c cells) {
			household.Preferences = append(household.Preferences, models.UserPrefernces{UserId: c.id("user_id"),
				QuickScanDefaultGroupId: c.idPtr("quick_scan_default_group_id"), QuickScanDefaultPaidById: c.idPtr("quick_scan_default_paid_by_id"),
				QuickScanDefaultStatus: models.NormalizeReceiptStatus(models.ReceiptStatus(c.text("quick_scan_default_status"))),
				CloseChipSelectOnSelect: c.boolean("close_chip_select_on_select"), MonthlySpendingGoal: c.decimalPtr("monthly_spending_goal"),
				Language: c.text("language"), AiLanguage: c.text("ai_language"), Region: c.text("region"), OnboardingPending: c.boolean("onboarding_pending"),
				WarrantyPeriodYears: c.intPtr("warranty_period_years"), WarrantyReminderLeadDays: c.intPtr("warranty_reminder_lead_days")})
		}},
		{"dashboard_layouts", func(c cells) {
			household.Layouts = append(household.Layouts, models.DashboardLayout{UserId: c.id("user_id"), Layout: c.text("layout")})
		}},
		{"group_receipt_settings", func(c cells) {
			// An export from before 2026-11 names the note's two switches after the comments, and has a
			// "required" column beside each "enabled" one. Paid by and status that were shown and required are
			// the old defaults nobody chose, so they read as off, like the data migration does for a database.
			settings := models.GroupReceiptSettings{GroupId: c.id("group_id"),
				HideImages: c.boolean("hide_images"), HideReceiptCategories: c.boolean("hide_receipt_categories"),
				HideReceiptTags: c.boolean("hide_receipt_tags"),
				HideNote:        c.boolean("hide_note") || c.boolean("hide_comments"),
				QuickScanPaidByEnabled:     c.boolean("quick_scan_paid_by_enabled") && !c.boolean("quick_scan_paid_by_required"),
				QuickScanDefaultPaidByType: models.QuickScanDefaultPaidByType(c.text("quick_scan_default_paid_by_type")),
				QuickScanDefaultPaidById:   c.idPtr("quick_scan_default_paid_by_id"),
				QuickScanStatusEnabled:     c.boolean("quick_scan_status_enabled") && !c.boolean("quick_scan_status_required"),
				QuickScanDefaultStatus:     models.NormalizeReceiptStatus(models.ReceiptStatus(c.text("quick_scan_default_status"))),
				QuickScanCategoriesEnabled: c.boolean("quick_scan_categories_enabled"),
				QuickScanTagsEnabled:       c.boolean("quick_scan_tags_enabled"),
				QuickScanNoteEnabled:       c.boolean("quick_scan_note_enabled") || c.boolean("quick_scan_comment_enabled")}
			household.GroupSettings = append(household.GroupSettings, settings)
		}},
	}

	for _, step := range steps {
		if err := read(step.table, step.each); err != nil {
			return nil, err
		}
	}

	household.checkReferences()
	household.joinOldComments()
	return household, nil
}

// joinOldComments gives each receipt of an older export its comments as its note, oldest first, the way the
// data migration comments-to-note-v1 does for a database. A receipt that already has a note keeps it.
func (household *Household) joinOldComments() {
	if len(household.OldComments) == 0 {
		return
	}

	names := make(map[uint]string, len(household.Users))
	for _, user := range household.Users {
		names[user.ID] = user.DisplayName
		if names[user.ID] == "" {
			names[user.ID] = user.Username
		}
	}

	comments := slices.Clone(household.OldComments)
	slices.SortStableFunc(comments, func(a, b SourceComment) int {
		if order := a.CreatedAt.Compare(b.CreatedAt); order != 0 {
			return order
		}
		return cmp.Compare(a.ID, b.ID)
	})

	entries := map[uint][]models.NoteEntry{}
	for _, comment := range comments {
		author := ""
		if comment.UserId != nil {
			author = names[*comment.UserId]
		}
		entries[comment.ReceiptId] = append(entries[comment.ReceiptId], models.NoteEntry{Author: author, Text: comment.Text})
	}

	for i := range household.Receipts {
		if household.Receipts[i].Note == "" {
			household.Receipts[i].Note = models.JoinCommentsIntoNote(entries[household.Receipts[i].ID])
		}
	}
}

// checkReferences reports rows pointing at a row the export does not have, so the import never
// writes a dangling id.
func (household *Household) checkReferences() {
	ids := func(count int, idOf func(int) uint) map[uint]bool {
		set := make(map[uint]bool, count)
		for i := 0; i < count; i++ {
			set[idOf(i)] = true
		}
		return set
	}
	users := ids(len(household.Users), func(i int) uint { return household.Users[i].ID })
	groups := ids(len(household.Groups), func(i int) uint { return household.Groups[i].ID })
	categories := ids(len(household.Categories), func(i int) uint { return household.Categories[i].ID })
	tags := ids(len(household.Tags), func(i int) uint { return household.Tags[i].ID })
	lists := ids(len(household.Lists), func(i int) uint { return household.Lists[i].ID })
	items := ids(len(household.Items), func(i int) uint { return household.Items[i].ID })
	receipts := ids(len(household.Receipts), func(i int) uint { return household.Receipts[i].ID })
	products := ids(len(household.Products), func(i int) uint { return household.Products[i].ID })
	templates := ids(len(household.Templates), func(i int) uint { return household.Templates[i].ID })

	missing := func(table string, row int, column string, set map[uint]bool, id *uint) {
		if id != nil && *id != 0 && !set[*id] {
			household.addProblem(fmt.Sprintf("%s.csv row %d %s: refers to %d, which is not in the export", table, row+2, column, *id))
		}
	}

	for i, member := range household.Members {
		missing("group_members", i, "user_id", users, &member.UserId)
		missing("group_members", i, "group_id", groups, &member.GroupId)
	}
	for i, list := range household.Lists {
		missing("shopping_lists", i, "group_id", groups, &list.GroupId)
	}
	for i, item := range household.Items {
		missing("shopping_list_items", i, "shopping_list_id", lists, &item.ShoppingListId)
		missing("shopping_list_items", i, "checked_by_user_id", users, item.CheckedByUserId)
	}
	for i, receipt := range household.Receipts {
		missing("receipts", i, "group_id", groups, &receipt.GroupId)
		missing("receipts", i, "paid_by_user_id", users, &receipt.PaidByUserID)
	}
	for i, pair := range household.ReceiptCats {
		missing("receipt_categories", i, "receipt_id", receipts, &pair.Left)
		missing("receipt_categories", i, "category_id", categories, &pair.Right)
	}
	for i, pair := range household.ReceiptTags {
		missing("receipt_tags", i, "receipt_id", receipts, &pair.Left)
		missing("receipt_tags", i, "tag_id", tags, &pair.Right)
	}
	for i, product := range household.Products {
		missing("receipt_products", i, "receipt_id", receipts, &product.ReceiptId)
		missing("receipt_products", i, "category_id", categories, product.CategoryId)
		missing("receipt_products", i, "matched_shopping_list_item_id", items, product.MatchedShoppingListItemId)
	}
	for i, pair := range household.ProductTags {
		missing("receipt_product_tags", i, "receipt_product_id", products, &pair.Left)
		missing("receipt_product_tags", i, "tag_id", tags, &pair.Right)
	}
	for i, comment := range household.OldComments {
		missing("comments", i, "receipt_id", receipts, &comment.ReceiptId)
		missing("comments", i, "user_id", users, comment.UserId)
	}
	for i, file := range household.Files {
		missing("files", i, "receipt_id", receipts, &file.ReceiptId)
	}
	for i, trip := range household.Trips {
		missing("shopping_trips", i, "shopping_list_id", lists, &trip.ShoppingListId)
		missing("shopping_trips", i, "receipt_id", receipts, trip.ReceiptId)
	}
	for i, override := range household.Overrides {
		missing("classification_overrides", i, "group_id", groups, &override.GroupId)
	}
	allGroups := ids(len(household.Manifest.AllGroupIds), func(i int) uint { return household.Manifest.AllGroupIds[i] })
	for i, pair := range household.TemplateGroups {
		missing("report_template_groups", i, "report_template_id", templates, &pair.Left)
		if !allGroups[pair.Right] {
			missing("report_template_groups", i, "group_id", groups, &pair.Right)
		}
	}
	for i, preferences := range household.Preferences {
		missing("user_preferences", i, "user_id", users, &preferences.UserId)
	}
	for i, layout := range household.Layouts {
		missing("dashboard_layouts", i, "user_id", users, &layout.UserId)
	}
	for i, settings := range household.GroupSettings {
		missing("group_receipt_settings", i, "group_id", groups, &settings.GroupId)
	}
}

// cells reads one CSV row. A cell that cannot be read records a problem and answers the zero value.
type cells struct {
	table     string
	line      int
	row       map[string]string
	household *Household
}

func (c cells) fail(column string, reason string) {
	c.household.addProblem(fmt.Sprintf("%s.csv row %d %s: %s", c.table, c.line, column, reason))
}

func (c cells) text(column string) string {
	return c.row[column]
}

func (c cells) base() models.BaseModel {
	return models.BaseModel{ID: c.id("id"), CreatedAt: c.instant("created_at"), CreatedBy: c.idPtr("created_by")}
}

func (c cells) id(column string) uint {
	value, err := strconv.ParseUint(c.row[column], 10, 32)
	if err != nil || value == 0 {
		c.fail(column, "is not an id")
		return 0
	}
	return uint(value)
}

func (c cells) idPtr(column string) *uint {
	if c.row[column] == "" {
		return nil
	}
	value := c.id(column)
	return &value
}

func (c cells) number(column string) int {
	if c.row[column] == "" {
		return 0
	}
	value, err := strconv.Atoi(c.row[column])
	if err != nil {
		c.fail(column, "is not a whole number")
	}
	return value
}

func (c cells) intPtr(column string) *int {
	if c.row[column] == "" {
		return nil
	}
	value := c.number(column)
	return &value
}

func (c cells) boolean(column string) bool {
	if c.row[column] == "" {
		return false
	}
	value, err := strconv.ParseBool(c.row[column])
	if err != nil {
		c.fail(column, "is not true or false")
	}
	return value
}

func (c cells) boolPtr(column string) *bool {
	if c.row[column] == "" {
		return nil
	}
	value := c.boolean(column)
	return &value
}

func (c cells) decimal(column string) decimal.Decimal {
	value, err := decimal.NewFromString(c.row[column])
	if err != nil {
		c.fail(column, "is not an amount")
	}
	return value
}

func (c cells) decimalPtr(column string) *decimal.Decimal {
	if c.row[column] == "" {
		return nil
	}
	value := c.decimal(column)
	return &value
}

// day reads a calendar day as midnight UTC, the way receipt dates are stored.
func (c cells) day(column string) time.Time {
	value, err := time.Parse(time.DateOnly, c.row[column])
	if err != nil {
		c.fail(column, "is not a day (yyyy-MM-dd)")
		return time.Time{}
	}
	return utils.CalendarDayUTC(value)
}

func (c cells) dayTextPtr(column string) *string {
	if c.row[column] == "" {
		return nil
	}
	c.day(column)
	value := c.row[column]
	return &value
}

func (c cells) instant(column string) time.Time {
	if c.row[column] == "" {
		return time.Time{}
	}
	value, err := time.Parse(time.RFC3339Nano, c.row[column])
	if err != nil {
		c.fail(column, "is not a moment (RFC 3339)")
	}
	return value.UTC()
}

func (c cells) instantPtr(column string) *time.Time {
	if c.row[column] == "" {
		return nil
	}
	value := c.instant(column)
	return &value
}

func (c cells) classification() models.FoodClassification {
	return models.FoodClassification{Health: c.text("health"), FoodGroup: c.text("food_group"), Seasonality: c.text("seasonality"),
		ClassifiedAt: c.instantPtr("classified_at"), ClassificationOverridden: c.boolean("classification_overridden")}
}
