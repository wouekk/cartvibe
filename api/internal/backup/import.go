package backup

import (
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrHouseholdNotEmpty = errors.New("the household already has receipts or shopping lists: an export imports into an empty household only")
	ErrHasProblems       = errors.New("the export has rows that cannot be imported")
)

// Name-only people get this colour when the export has none.
const defaultAvatarColor = "#27b1ff"

const (
	PhaseStaging = "staging_files"
	PhaseWriting = "writing"
)

// ImportOptions describe one import run.
type ImportOptions struct {
	JobId          uint
	ImporterUserId uint
	// MeSourceUserId is the person in the export who is the importer: their rows become the importer's.
	MeSourceUserId *uint
	Now            time.Time
	Progress       func(phase string, done int, total int)
}

// HouseholdIsEmpty reports whether the server has no receipts and no shopping lists, the only state an
// export is imported into (a second import of the same file is refused by this check).
func HouseholdIsEmpty(db *gorm.DB) (bool, error) {
	var receipts, lists int64
	if err := db.Model(models.Receipt{}).Count(&receipts).Error; err != nil {
		return false, err
	}
	if err := db.Model(models.ShoppingList{}).Count(&lists).Error; err != nil {
		return false, err
	}
	return receipts == 0 && lists == 0, nil
}

type idMap map[uint]uint

func (ids idMap) ptr(id *uint) *uint {
	if id == nil {
		return nil
	}
	if mapped, ok := ids[*id]; ok {
		return &mapped
	}
	return nil
}

type movedFile struct {
	from string
	to   string
}

type importRun struct {
	tx        *gorm.DB
	household *Household
	options   ImportOptions
	archive   *Archive

	users, groups, categories, tags, lists, items, receipts, products, templates idMap
	// carried are the people whose own settings (goal, language, Dashboard) the import writes: the
	// name-only people it creates and the importer when they are one of the people in the export.
	carried map[uint]bool
	staged  map[string]string
	moved   []movedFile
	counts  []TableCount
}

// Import writes a parsed export into an empty household. The photos are staged under the data
// folder first (outside the transaction, which holds SQLite's write lock); then one transaction
// writes every row and moves each staged photo to its place. On any failure nothing stays: the
// transaction rolls back and the moved photos go back to the staging folder, which is removed.
func Import(db *gorm.DB, archive *Archive, household *Household, options ImportOptions) ([]TableCount, error) {
	if household.ProblemCount() > 0 {
		return nil, ErrHasProblems
	}

	run := &importRun{
		household: household, options: options, archive: archive,
		users: idMap{}, groups: idMap{}, categories: idMap{}, tags: idMap{}, lists: idMap{}, items: idMap{},
		receipts: idMap{}, products: idMap{}, templates: idMap{},
		carried: map[uint]bool{}, staged: map[string]string{},
	}

	stagingDir, err := stagingDirectory(options.JobId)
	if err != nil {
		return nil, err
	}
	defer utils.RemoveAllInDataDir(stagingDir)

	if err := run.stage(stagingDir); err != nil {
		return nil, err
	}

	run.progress(PhaseWriting, 0, 1)
	err = db.Transaction(func(tx *gorm.DB) error {
		run.tx = tx
		return run.write()
	})
	if err != nil {
		run.moveBack()
		return nil, err
	}

	run.progress(PhaseWriting, 1, 1)
	return run.counts, nil
}

func stagingDirectory(jobId uint) (string, error) {
	dataDir, err := utils.GetDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dataDir, ".import-"+strconv.FormatUint(uint64(jobId), 10)), nil
}

func (run *importRun) progress(phase string, done int, total int) {
	if run.options.Progress != nil {
		run.options.Progress(phase, done, total)
	}
}

// stage copies every photo the export holds into the staging folder, after checking it against the
// manifest. Entry names come from the tables, never from the ZIP's own listing.
func (run *importRun) stage(stagingDir string) error {
	var entries []string
	for _, file := range run.household.Files {
		if file.Entry != "" && run.archive.Has(file.Entry) {
			entries = append(entries, file.Entry)
		}
	}
	for _, trip := range run.household.Trips {
		if trip.Photo != "" && run.archive.Has(trip.Photo) {
			entries = append(entries, trip.Photo)
		}
	}
	if len(entries) == 0 {
		return nil
	}

	dataDir, err := utils.GetDataDir()
	if err != nil {
		return err
	}
	for _, dir := range []string{dataDir, stagingDir} {
		if err := utils.EnsureDataDirectory(dir); err != nil {
			return err
		}
	}

	for index, entry := range entries {
		run.progress(PhaseStaging, index, len(entries))
		content, err := run.archive.File(entry)
		if err != nil {
			return err
		}
		path := filepath.Join(stagingDir, strconv.Itoa(index))
		if err := utils.WriteDataFile(path, content); err != nil {
			return err
		}
		run.staged[entry] = path
	}
	run.progress(PhaseStaging, len(entries), len(entries))
	return nil
}

func (run *importRun) moveBack() {
	for i := len(run.moved) - 1; i >= 0; i-- {
		_ = utils.RenameDataPath(run.moved[i].to, run.moved[i].from)
	}
}

func (run *importRun) count(table string, rows int) {
	run.counts = append(run.counts, TableCount{Name: table, Count: rows})
}

func (run *importRun) write() error {
	empty, err := HouseholdIsEmpty(run.tx)
	if err != nil {
		return err
	}
	if !empty {
		return ErrHouseholdNotEmpty
	}

	steps := []func() error{
		run.writeHouseholdSettings, run.writeUsers, run.writeGroups, run.writeCategoriesAndTags, run.writeLists,
		run.writeReceipts, run.writeProducts, run.writeFiles, run.writeTrips, run.writeSmallTables,
		run.writeTemplates, run.writePersonalSettings,
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return err
		}
	}
	return failWriteForTest
}

// failWriteForTest makes the last step of the transaction fail, so a test can prove the rollback.
var failWriteForTest error

func (run *importRun) writeHouseholdSettings() error {
	settings, err := repositories.NewSystemSettingsRepository(run.tx).GetSystemSettings()
	if err != nil {
		return err
	}
	household := run.household.Manifest.Household
	updates := map[string]any{}
	if household.CurrencyDisplay != "" {
		updates["currency_display"] = household.CurrencyDisplay
		updates["currency_hide_decimal_places"] = household.CurrencyHideDecimalPlaces
	}
	if household.CurrencyThousandthsSeparator != "" {
		updates["currency_thousandths_separator"] = household.CurrencyThousandthsSeparator
	}
	if household.CurrencyDecimalSeparator != "" {
		updates["currency_decimal_separator"] = household.CurrencyDecimalSeparator
	}
	if household.CurrencySymbolPosition != "" {
		updates["currency_symbol_position"] = household.CurrencySymbolPosition
	}
	if _, err := time.LoadLocation(household.TimeZone); err == nil && household.TimeZone != "" && household.TimeZone != "Local" {
		updates["time_zone"] = household.TimeZone
	}
	if models.IsDateFormat(household.DateFormat) {
		updates["date_format"] = household.DateFormat
	}
	if len(updates) == 0 {
		return nil
	}
	return run.tx.Model(&models.SystemSettings{}).Where("id = ?", settings.ID).Updates(updates).Error
}

func (run *importRun) writeUsers() error {
	existing, err := existingUsernames(run.tx)
	if err != nil {
		return err
	}
	roles := repositories.NewRoleRepository(run.tx)
	userRoleId, err := roles.GetAppRoleIdByName(repositories.FamilyUserRoleName)
	if err != nil {
		return err
	}
	if userRoleId == nil {
		if userRoleId, err = roles.GetDefaultAppRoleId(); err != nil {
			return err
		}
	}

	created := 0
	for _, user := range run.household.Users {
		if run.options.MeSourceUserId != nil && *run.options.MeSourceUserId == user.ID {
			run.users[user.ID] = run.options.ImporterUserId
			run.carried[user.ID] = true
			continue
		}
		if id, ok := existing[user.Username]; ok {
			run.users[user.ID] = id
			continue
		}

		// A person with no account here is kept as a name: a dummy user cannot sign in, and an admin
		// can give them a password later (Convert to normal user).
		color := user.DefaultAvatarColor
		if color == "" {
			color = defaultAvatarColor
		}
		nameOnly := models.User{Username: user.Username, DisplayName: user.DisplayName, DefaultAvatarColor: color,
			IsDummyUser: true, Password: "", AppRoleID: userRoleId}
		nameOnly.CreatedAt = user.CreatedAt
		if err := run.tx.Create(&nameOnly).Error; err != nil {
			return err
		}
		if _, err := repositories.NewGroupRepository(run.tx).CreateAllGroup(nameOnly.ID); err != nil {
			return err
		}
		run.users[user.ID] = nameOnly.ID
		run.carried[user.ID] = true
		existing[user.Username] = nameOnly.ID
		created++
	}
	run.count("users", created)
	return nil
}

func existingUsernames(db *gorm.DB) (map[string]uint, error) {
	var users []models.User
	if err := db.Model(models.User{}).Select("id", "username").Find(&users).Error; err != nil {
		return nil, err
	}
	byName := make(map[string]uint, len(users))
	for _, user := range users {
		byName[user.Username] = user.ID
	}
	return byName, nil
}

func (run *importRun) writeGroups() error {
	var existing []models.Group
	if err := run.tx.Model(models.Group{}).Where("is_all_group = ?", false).Order("id").Find(&existing).Error; err != nil {
		return err
	}
	reusable := map[string]uint{}
	for _, group := range existing {
		if _, taken := reusable[group.Name]; !taken {
			reusable[group.Name] = group.ID
		}
	}

	settingsBySource := map[uint]models.GroupReceiptSettings{}
	for _, settings := range run.household.GroupSettings {
		settingsBySource[settings.GroupId] = settings
	}

	roles := repositories.NewRoleRepository(run.tx)
	defaultRoleId, err := roles.GetDefaultGroupRoleId()
	if err != nil {
		return err
	}

	for _, group := range run.household.Groups {
		settings, hasSettings := settingsBySource[group.ID]
		if id, ok := reusable[group.Name]; ok {
			delete(reusable, group.Name)
			run.groups[group.ID] = id
			if hasSettings {
				if err := run.writeGroupSettings(id, settings, true); err != nil {
					return err
				}
			}
			continue
		}

		created := models.Group{Name: group.Name, Status: group.Status, IsDefaultGroup: group.IsDefaultGroup}
		created.CreatedAt = group.CreatedAt
		if err := run.tx.Create(&created).Error; err != nil {
			return err
		}
		run.groups[group.ID] = created.ID
		if !hasSettings {
			// A household the export says nothing about gets a new household's settings.
			settings = models.GroupReceiptSettings{}
		}
		if err := run.writeGroupSettings(created.ID, settings, false); err != nil {
			return err
		}
	}

	members := 0
	for _, member := range run.household.Members {
		roleId, err := roles.GetGroupRoleIdByName(member.Role)
		if err != nil {
			return err
		}
		if roleId == nil {
			roleId, err = roles.GetGroupRoleIdByName(repositories.FamilyMemberRoleName)
			if err != nil {
				return err
			}
		}
		row := models.GroupMember{UserID: run.users[member.UserId], GroupID: run.groups[member.GroupId], GroupRoleID: roleId}
		result := run.tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row)
		if result.Error != nil {
			return result.Error
		}
		members += int(result.RowsAffected)
	}

	// The importer keeps every household in reach even when the export did not list them in it.
	for _, groupId := range run.groups {
		row := models.GroupMember{UserID: run.options.ImporterUserId, GroupID: groupId, GroupRoleID: defaultRoleId}
		if err := run.tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
			return err
		}
	}

	run.count("groups", len(run.household.Groups))
	run.count("group_members", members)
	return nil
}

func (run *importRun) writeGroupSettings(groupId uint, settings models.GroupReceiptSettings, existing bool) error {
	settings.ID = 0
	settings.GroupId = groupId
	settings.QuickScanDefaultPaidById = run.users.ptr(settings.QuickScanDefaultPaidById)
	settings.CreatedAt = time.Time{}
	if !existing {
		return run.tx.Create(&settings).Error
	}
	// Select("*") writes the false flags too (a struct Updates would skip them).
	return run.tx.Model(&models.GroupReceiptSettings{}).Where("group_id = ?", groupId).
		Select("*").Omit("id", "created_at", "created_by", "created_by_string", "group_id").Updates(&settings).Error
}

func (run *importRun) writeCategoriesAndTags() error {
	categoriesByName, tagsByName, err := existingCatalog(run.tx)
	if err != nil {
		return err
	}

	createdCategories := 0
	for _, category := range run.household.Categories {
		if id, ok := matchCategory(categoriesByName, category); ok {
			run.categories[category.ID] = id
			continue
		}
		created := models.Category{Name: category.Name, Description: category.Description, Skipped: category.Skipped, Aliases: category.Aliases}
		if err := run.tx.Create(&created).Error; err != nil {
			return err
		}
		run.categories[category.ID] = created.ID
		categoriesByName[strings.ToLower(created.Name)] = created.ID
		createdCategories++
	}

	createdTags := 0
	for _, tag := range run.household.Tags {
		if id, ok := tagsByName[strings.ToLower(tag.Name)]; ok {
			run.tags[tag.ID] = id
			continue
		}
		created := models.Tag{Name: tag.Name, Description: tag.Description, ShowOnDashboard: tag.ShowOnDashboard}
		if err := run.tx.Create(&created).Error; err != nil {
			return err
		}
		run.tags[tag.ID] = created.ID
		tagsByName[strings.ToLower(created.Name)] = created.ID
		createdTags++
	}

	run.count("categories", createdCategories)
	run.count("tags", createdTags)
	return nil
}

// existingCatalog indexes this server's categories by lower-case name and old names (aliases), and its
// tags by lower-case name.
func existingCatalog(db *gorm.DB) (map[string]uint, map[string]uint, error) {
	var categories []models.Category
	if err := db.Model(models.Category{}).Find(&categories).Error; err != nil {
		return nil, nil, err
	}
	categoriesByName := map[string]uint{}
	for _, category := range categories {
		for _, alias := range repositories.CategoryAliases(category.Aliases) {
			categoriesByName[strings.ToLower(alias)] = category.ID
		}
	}
	// Current names win over another category's old name.
	for _, category := range categories {
		categoriesByName[strings.ToLower(category.Name)] = category.ID
	}

	var tags []models.Tag
	if err := db.Model(models.Tag{}).Find(&tags).Error; err != nil {
		return nil, nil, err
	}
	tagsByName := map[string]uint{}
	for _, tag := range tags {
		tagsByName[strings.ToLower(tag.Name)] = tag.ID
	}
	return categoriesByName, tagsByName, nil
}

func matchCategory(byName map[string]uint, category models.Category) (uint, bool) {
	if id, ok := byName[strings.ToLower(category.Name)]; ok {
		return id, true
	}
	for _, alias := range repositories.CategoryAliases(category.Aliases) {
		if id, ok := byName[strings.ToLower(alias)]; ok {
			return id, true
		}
	}
	return 0, false
}

func (run *importRun) writeLists() error {
	for _, list := range run.household.Lists {
		created := models.ShoppingList{GroupId: run.groups[list.GroupId], Name: list.Name}
		created.CreatedAt = list.CreatedAt
		created.CreatedBy = run.users.ptr(list.CreatedBy)
		if err := run.tx.Create(&created).Error; err != nil {
			return err
		}
		run.lists[list.ID] = created.ID
	}

	for _, item := range run.household.Items {
		created := item
		created.ID = 0
		created.ShoppingListId = run.lists[item.ShoppingListId]
		created.CheckedByUserId = run.users.ptr(item.CheckedByUserId)
		created.CreatedBy = run.users.ptr(item.CreatedBy)
		if err := run.tx.Omit(clause.Associations).Create(&created).Error; err != nil {
			return err
		}
		run.items[item.ID] = created.ID
	}

	run.count("shopping_lists", len(run.household.Lists))
	run.count("shopping_list_items", len(run.household.Items))
	return nil
}

func (run *importRun) writeReceipts() error {
	rows := make([]models.Receipt, len(run.household.Receipts))
	for i, receipt := range run.household.Receipts {
		rows[i] = models.Receipt{Name: receipt.Name, ShopName: receipt.ShopName, Amount: receipt.Amount,
			OriginalAmount: receipt.OriginalAmount, OriginalCurrency: receipt.OriginalCurrency, ExchangeRate: receipt.ExchangeRate,
			Date: utils.CalendarDayUTC(receipt.Date), WarrantyUntil: receipt.WarrantyUntil, ResolvedDate: receipt.ResolvedDate,
			PaidByUserID: run.users[receipt.PaidByUserID], Status: receipt.Status, GroupId: run.groups[receipt.GroupId],
			Note: receipt.Note}
		rows[i].CreatedAt = receipt.CreatedAt
		rows[i].CreatedBy = run.users.ptr(receipt.CreatedBy)
	}
	if len(rows) > 0 {
		if err := run.tx.Omit(clause.Associations).CreateInBatches(&rows, 200).Error; err != nil {
			return err
		}
	}
	for i, receipt := range run.household.Receipts {
		run.receipts[receipt.ID] = rows[i].ID
	}

	if err := run.writeLinks("receipt_categories", "receipt_id", "category_id", run.household.ReceiptCats, run.receipts, run.categories); err != nil {
		return err
	}
	if err := run.writeLinks("receipt_tags", "receipt_id", "tag_id", run.household.ReceiptTags, run.receipts, run.tags); err != nil {
		return err
	}
	run.count("receipts", len(rows))
	return nil
}

func (run *importRun) writeLinks(table string, leftColumn string, rightColumn string, pairs []IdPair, left idMap, right idMap) error {
	rows := make([]map[string]any, 0, len(pairs))
	for _, pair := range pairs {
		rows = append(rows, map[string]any{leftColumn: left[pair.Left], rightColumn: right[pair.Right]})
	}
	if len(rows) == 0 {
		return nil
	}
	// Two export categories can match one category here, so a link may repeat.
	return run.tx.Table(table).Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(rows, 200).Error
}

func (run *importRun) writeProducts() error {
	rows := make([]models.ReceiptProduct, len(run.household.Products))
	for i, product := range run.household.Products {
		rows[i] = product
		rows[i].ID = 0
		rows[i].ReceiptId = run.receipts[product.ReceiptId]
		rows[i].CategoryId = run.categories.ptr(product.CategoryId)
		rows[i].MatchedShoppingListItemId = run.items.ptr(product.MatchedShoppingListItemId)
		rows[i].CreatedBy = nil
		rows[i].Tags = nil
	}
	if len(rows) > 0 {
		if err := run.tx.Omit(clause.Associations).CreateInBatches(&rows, 200).Error; err != nil {
			return err
		}
	}
	for i, product := range run.household.Products {
		run.products[product.ID] = rows[i].ID
	}
	if err := run.writeLinks("receipt_product_tags", "receipt_product_id", "tag_id", run.household.ProductTags, run.products, run.tags); err != nil {
		return err
	}
	run.count("receipt_products", len(rows))
	return nil
}

func (run *importRun) moveIntoPlace(staged string, final string) error {
	if err := utils.EnsureDataDirectory(filepath.Dir(final)); err != nil {
		return err
	}
	if err := utils.RenameDataPath(staged, final); err != nil {
		return err
	}
	run.moved = append(run.moved, movedFile{from: staged, to: final})
	return nil
}

// writeFiles writes a receipt file's row only when its photo came along: a row without a file would
// show a broken image.
func (run *importRun) writeFiles() error {
	fileRepository := repositories.NewFileRepository(run.tx)
	written := 0
	for _, file := range run.household.Files {
		staged, ok := run.staged[file.Entry]
		if !ok {
			continue
		}
		created := models.FileData{Name: file.Name, FileType: file.FileType, Size: file.Size, ReceiptId: run.receipts[file.ReceiptId]}
		created.CreatedAt = file.CreatedAt
		if err := run.tx.Omit(clause.Associations).Create(&created).Error; err != nil {
			return err
		}
		final, err := fileRepository.BuildFilePath(utils.UintToString(created.ReceiptId), utils.UintToString(created.ID), created.Name)
		if err != nil {
			return err
		}
		if err := run.moveIntoPlace(staged, final); err != nil {
			return err
		}
		written++
	}
	run.count("files", written)
	return nil
}

var unsafeExtension = regexp.MustCompile(`[^a-z0-9]`)

func (run *importRun) writeTrips() error {
	dataDir, err := utils.GetDataDir()
	if err != nil {
		return err
	}
	for _, trip := range run.household.Trips {
		created := trip.ShoppingTrip
		created.ID = 0
		created.ShoppingListId = run.lists[trip.ShoppingListId]
		created.ReceiptId = run.receipts.ptr(trip.ReceiptId)
		created.PlannedItems = run.remapPlannedItems(trip.PlannedItems)
		created.NextAttemptAt = run.options.Now
		created.QueuedAt = run.options.Now
		created.Attempts = 0
		created.CreatedBy = nil
		created.PhotoPath = ""
		if created.Status == models.SHOPPING_TRIP_RUNNING {
			created.Status = models.SHOPPING_TRIP_PENDING
		}

		if staged, ok := run.staged[trip.Photo]; ok {
			name, err := utils.GetRandomString(16)
			if err != nil {
				return err
			}
			extension := unsafeExtension.ReplaceAllString(strings.ToLower(strings.TrimPrefix(filepath.Ext(trip.PhotoName), ".")), "")
			if extension == "" {
				extension = "jpg"
			}
			final := filepath.Join(dataDir, "shopping-trips", name+"."+extension)
			if err := run.moveIntoPlace(staged, final); err != nil {
				return err
			}
			created.PhotoPath = final
		}

		if err := run.tx.Omit(clause.Associations).Create(&created).Error; err != nil {
			return err
		}
	}
	run.count("shopping_trips", len(run.household.Trips))
	return nil
}

func (run *importRun) remapPlannedItems(plannedItems string) string {
	var items []models.ShoppingTripPlannedItem
	if err := json.Unmarshal([]byte(plannedItems), &items); err != nil {
		return "[]"
	}
	kept := []models.ShoppingTripPlannedItem{}
	for _, item := range items {
		if id, ok := run.items[item.Id]; ok {
			kept = append(kept, models.ShoppingTripPlannedItem{Id: id, Name: item.Name})
		}
	}
	remapped, _ := json.Marshal(kept)
	return string(remapped)
}

func (run *importRun) writeSmallTables() error {
	for _, override := range run.household.Overrides {
		created := models.ProductClassificationOverride{GroupId: run.groups[override.GroupId], NormalizedName: override.NormalizedName, Health: override.Health}
		if err := run.tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&created).Error; err != nil {
			return err
		}
	}
	for _, rate := range run.household.Rates {
		created := models.ExchangeRate{Code: rate.Code, Rate: rate.Rate}
		err := run.tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "code"}}, DoUpdates: clause.AssignmentColumns([]string{"rate"})}).
			Create(&created).Error
		if err != nil {
			return err
		}
	}
	run.count("classification_overrides", len(run.household.Overrides))
	run.count("exchange_rates", len(run.household.Rates))
	return nil
}

func (run *importRun) importerAllGroupId() (uint, error) {
	var group models.Group
	err := run.tx.Model(models.Group{}).
		Joins("JOIN group_members ON group_members.group_id = groups.id AND group_members.user_id = ?", run.options.ImporterUserId).
		Where("groups.is_all_group = ?", true).Order("groups.id").Limit(1).Find(&group).Error
	return group.ID, err
}

// writeTemplates writes the report templates with their group, category, tag and payer ids rewritten.
// A template with the name of one already here (a starter template) replaces its configuration.
func (run *importRun) writeTemplates() error {
	allGroupId, err := run.importerAllGroupId()
	if err != nil {
		return err
	}
	groupIds := idMap{}
	for source, target := range run.groups {
		groupIds[source] = target
	}
	for _, source := range run.household.Manifest.AllGroupIds {
		if allGroupId != 0 {
			groupIds[source] = allGroupId
		}
	}

	written := 0
	for _, template := range run.household.Templates {
		configuration, ok := remapReportConfiguration(template.Configuration, groupIds, run.categories, run.tags, run.users)
		if !ok {
			continue
		}

		var existing models.ReportTemplate
		if err := run.tx.Model(models.ReportTemplate{}).Where("name = ?", template.Name).Order("id").Limit(1).Find(&existing).Error; err != nil {
			return err
		}
		if existing.ID != 0 {
			err := run.tx.Model(&models.ReportTemplate{}).Where("id = ?", existing.ID).
				Updates(map[string]any{"configuration": json.RawMessage(configuration), "configuration_version": template.ConfigurationVersion}).Error
			if err != nil {
				return err
			}
			if err := run.tx.Where("report_template_id = ?", existing.ID).Delete(&models.ReportTemplateGroup{}).Error; err != nil {
				return err
			}
			run.templates[template.ID] = existing.ID
		} else {
			created := models.ReportTemplate{Name: template.Name, Configuration: configuration, ConfigurationVersion: template.ConfigurationVersion}
			created.CreatedAt = template.CreatedAt
			created.CreatedBy = run.users.ptr(template.CreatedBy)
			if err := run.tx.Create(&created).Error; err != nil {
				return err
			}
			run.templates[template.ID] = created.ID
		}
		written++
	}

	for _, pair := range run.household.TemplateGroups {
		templateId, ok := run.templates[pair.Left]
		groupId, groupOk := groupIds[pair.Right]
		if !ok || !groupOk {
			continue
		}
		row := models.ReportTemplateGroup{ReportTemplateID: templateId, GroupID: groupId}
		if err := run.tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
			return err
		}
	}
	run.count("report_templates", written)
	return nil
}

// remapReportConfiguration rewrites the ids a stored report request names: groupIds and the filter's
// group, paidBy, categories and tags values. Everything else is kept as written. It answers false when
// an id cannot be mapped, so a template is skipped rather than pointing at the wrong thing; the
// "whoever generates" paid-by sentinel (-1) stays.
func remapReportConfiguration(configuration []byte, groups idMap, categories idMap, tags idMap, users idMap) ([]byte, bool) {
	var document map[string]any
	if err := json.Unmarshal(configuration, &document); err != nil {
		return nil, false
	}

	ok := true
	mapId := func(value any, ids idMap) any {
		var id float64
		switch typed := value.(type) {
		case float64:
			id = typed
		case string:
			parsed, err := strconv.ParseFloat(typed, 64)
			if err != nil {
				ok = false
				return value
			}
			id = parsed
		default:
			return value
		}
		if id < 0 {
			return value
		}
		mapped, found := ids[uint(id)]
		if !found {
			ok = false
			return value
		}
		if _, isString := value.(string); isString {
			return strconv.FormatUint(uint64(mapped), 10)
		}
		return float64(mapped)
	}
	mapValue := func(value any, ids idMap) any {
		if list, isList := value.([]any); isList {
			for i := range list {
				list[i] = mapId(list[i], ids)
			}
			return list
		}
		return mapId(value, ids)
	}

	if groupIds, isList := document["groupIds"].([]any); isList {
		document["groupIds"] = mapValue(groupIds, groups)
	}
	if filter, isMap := document["filter"].(map[string]any); isMap {
		for key, ids := range map[string]idMap{"group": groups, "paidBy": users, "categories": categories, "tags": tags} {
			field, isField := filter[key].(map[string]any)
			if !isField || field["value"] == nil || field["value"] == "" {
				continue
			}
			field["value"] = mapValue(field["value"], ids)
		}
	}

	remapped, err := json.Marshal(document)
	if err != nil || !ok {
		return nil, false
	}
	return remapped, true
}

var tagPanelId = regexp.MustCompile(`^tag:(\d+)$`)

// writePersonalSettings carries the goal, language, quick-scan defaults and Dashboard of the people
// the import created and of the importer (when picked as one of the people in the export). Accounts
// that already existed here keep their own.
func (run *importRun) writePersonalSettings() error {
	for _, preferences := range run.household.Preferences {
		if !run.carried[preferences.UserId] {
			continue
		}
		userId := run.users[preferences.UserId]
		updates := map[string]any{
			"quick_scan_default_group_id":   run.groups.ptr(preferences.QuickScanDefaultGroupId),
			"quick_scan_default_paid_by_id": run.users.ptr(preferences.QuickScanDefaultPaidById),
			"quick_scan_default_status":     string(preferences.QuickScanDefaultStatus),
			"close_chip_select_on_select":   preferences.CloseChipSelectOnSelect,
			"monthly_spending_goal":         preferences.MonthlySpendingGoal,
			"language":                      preferences.Language,
			"ai_language":                   preferences.AiLanguage,
			"region":                        preferences.Region,
			"onboarding_pending":            preferences.OnboardingPending,
			"warranty_period_years":         preferences.WarrantyPeriodYears,
			"warranty_reminder_lead_days":   preferences.WarrantyReminderLeadDays,
		}
		var existing models.UserPreferences
		if err := run.tx.Model(models.UserPreferences{}).Where("user_id = ?", userId).Limit(1).Find(&existing).Error; err != nil {
			return err
		}
		if existing.ID == 0 {
			if err := run.tx.Create(&models.UserPreferences{UserId: userId}).Error; err != nil {
				return err
			}
		}
		if err := run.tx.Model(&models.UserPreferences{}).Where("user_id = ?", userId).Updates(updates).Error; err != nil {
			return err
		}
	}

	for _, layout := range run.household.Layouts {
		if !run.carried[layout.UserId] {
			continue
		}
		userId := run.users[layout.UserId]
		remapped := run.remapLayout(layout.Layout)
		err := run.tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, DoUpdates: clause.AssignmentColumns([]string{"layout"})}).
			Create(&models.DashboardLayout{UserId: userId, Layout: remapped}).Error
		if err != nil {
			return err
		}
	}
	return nil
}

// remapLayout rewrites the tag panels ("tag:12") of a Dashboard layout to this server's tag ids and drops
// the ones whose tag did not come along. The rest of the document is the client's and stays as it is.
func (run *importRun) remapLayout(layout string) string {
	var document map[string]any
	if err := json.Unmarshal([]byte(layout), &document); err != nil {
		return layout
	}
	panels, isList := document["panels"].([]any)
	if !isList {
		return layout
	}
	kept := []any{}
	for _, panel := range panels {
		entry, isMap := panel.(map[string]any)
		id, _ := entry["id"].(string)
		if !isMap || !tagPanelId.MatchString(id) {
			kept = append(kept, panel)
			continue
		}
		source, _ := strconv.ParseUint(tagPanelId.FindStringSubmatch(id)[1], 10, 32)
		if target, ok := run.tags[uint(source)]; ok {
			entry["id"] = fmt.Sprintf("tag:%d", target)
			kept = append(kept, entry)
		}
	}
	document["panels"] = kept
	if order, isList := document["compactOrder"].([]any); isList {
		keptOrder := []any{}
		for _, entry := range order {
			id, _ := entry.(string)
			if !tagPanelId.MatchString(id) {
				keptOrder = append(keptOrder, entry)
				continue
			}
			source, _ := strconv.ParseUint(tagPanelId.FindStringSubmatch(id)[1], 10, 32)
			if target, ok := run.tags[uint(source)]; ok {
				keptOrder = append(keptOrder, fmt.Sprintf("tag:%d", target))
			}
		}
		document["compactOrder"] = keptOrder
	}
	remapped, err := json.Marshal(document)
	if err != nil {
		return layout
	}
	return string(remapped)
}
