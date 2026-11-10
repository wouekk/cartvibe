package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ReceiptRepository struct {
	BaseRepository
}

func NewReceiptRepository(tx *gorm.DB) ReceiptRepository {
	repository := ReceiptRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX:   tx,
	}}
	return repository
}

func (repository ReceiptRepository) BeforeUpdateReceipt(currentReceipt models.Receipt, updatedReceipt models.Receipt) (err error) {
	db := repository.GetDB()
	if updatedReceipt.GroupId > 0 && currentReceipt.GroupId != updatedReceipt.GroupId && len(currentReceipt.ImageFiles) > 0 {
		var oldGroup models.Group
		var newGroup models.Group

		err = db.Table("groups").Where("id = ?", currentReceipt.GroupId).Select("id", "name").Find(&oldGroup).Error
		if err != nil {
			return err
		}

		err = db.Table("groups").Where("id = ?", updatedReceipt.GroupId).Select("id", "name").Find(&newGroup).Error
		if err != nil {
			return err
		}

		oldGroupPath, err := utils.BuildGroupPathString(utils.UintToString(oldGroup.ID), oldGroup.Name)
		if err != nil {
			return err
		}

		newGroupPath, err := utils.BuildGroupPathString(utils.UintToString(newGroup.ID), newGroup.Name)
		if err != nil {
			return err
		}

		for _, fileData := range currentReceipt.ImageFiles {
			filename := utils.BuildFileName(utils.UintToString(currentReceipt.ID), utils.UintToString(fileData.ID), fileData.Name)

			oldFilePath := filepath.Join(oldGroupPath, filename)
			newFilePathPath := filepath.Join(newGroupPath, filename)

			err := utils.RenameDataPath(oldFilePath, newFilePathPath)
			if err != nil {
				return err
			}
		}

	}

	return nil
}

// ReceiptUpdateDescriptionVersion marks the format of a RECEIPT_UPDATED
// system task's description, stored under its "version" key. The desktop reads
// it to decide how far to trust the "before" snapshot:
//
//   - 1 (no "version" key): "before" was loaded one level deep, so it lacks
//     item categories/tags/linked items, and it
//     lists linked items as top-level items.
//   - 2: "before" is loaded with GetFullyLoadedReceiptById, like "after".
//
// Bump it whenever the snapshot format changes.
const ReceiptUpdateDescriptionVersion = 2

func createFailedUpdateSystemTask(command commands.UpsertSystemTaskCommand, err error) {
	endedAt := time.Now()
	command.EndedAt = &endedAt
	command.Status = models.SYSTEM_TASK_FAILED
	command.ResultDescription = err.Error()

	repository := NewSystemTaskRepository(nil)
	repository.CreateSystemTask(command)
}

// NormalizeReceiptCalendarDates stores a receipt's Date as
// midnight UTC of the calendar day the client wrote. It is
// a calendar day, not a moment: the day must not shift with the app time zone, so
// it is pinned to one canonical instant and always read back in UTC.
//
// "As written" means the value's own offset is kept when the day is read, never
// converted: a browser's local midnight ("2026-09-01T00:00:00-04:00"), an AI's
// midnight UTC and an older mobile build's local wall time sent with a literal
// Z all name Sep 1. CreateReceipt and UpdateReceipt are the chokepoints every
// writer reaches (the form, quick scan, email, AI and single-call create).
// Values already stored are left alone; they are read by their UTC day.
func NormalizeReceiptCalendarDates(receipt *models.Receipt) {
	receipt.Date = utils.CalendarDayUTC(receipt.Date)

}

func (repository ReceiptRepository) UpdateReceipt(id string, command commands.UpsertReceiptCommand, userId uint) (models.Receipt, error) {
	db := repository.GetDB()

	systemTaskResultDescription := map[string]interface{}{}
	var endedAt time.Time
	stringId, err := utils.StringToUint(id)
	if err != nil {
		return models.Receipt{}, err
	}
	var currentReceipt models.Receipt
	var ranByUserId = userId

	systemTask := commands.UpsertSystemTaskCommand{
		Type:                 models.RECEIPT_UPDATED,
		AssociatedEntityType: models.RECEIPT,
		AssociatedEntityId:   stringId,
		StartedAt:            time.Now(),
		EndedAt:              &endedAt,
		Status:               models.SYSTEM_TASK_SUCCEEDED,
		RanByUserId:          &ranByUserId,
	}

	updatedReceipt, err := command.ToReceipt()
	if err != nil {
		createFailedUpdateSystemTask(systemTask, err)
		return models.Receipt{}, err
	}
	NormalizeReceiptCalendarDates(&updatedReceipt)

	err = db.Table("receipts").Where("id = ?", id).Preload(clause.Associations).Find(&currentReceipt).Error
	if err != nil {
		createFailedUpdateSystemTask(systemTask, err)
		return models.Receipt{}, err
	}

	systemTask.GroupId = &currentReceipt.GroupId
	systemTask.ReceiptId = &currentReceipt.ID

	// NOTE: ID and field used for afterReceiptUpdated
	updatedReceipt.ID = currentReceipt.ID
	updatedReceipt.ResolvedDate = currentReceipt.ResolvedDate

	// The "before" snapshot uses the same loader as "after" below, so the two
	// sides of the system task diff are loaded to the same depth. currentReceipt
	// only preloads one level (no item categories/tags/linked items, no custom
	// field definitions, linked items not yet filtered out), which would make
	// every update look like it changed those.
	beforeReceipt, err := repository.GetFullyLoadedReceiptById(id)
	if err != nil {
		createFailedUpdateSystemTask(systemTask, err)
		return models.Receipt{}, err
	}
	before, err := beforeReceipt.ToString()
	if err != nil {
		createFailedUpdateSystemTask(systemTask, err)
		return models.Receipt{}, err
	}
	systemTaskResultDescription["before"] = before

	err = db.Transaction(func(tx *gorm.DB) error {
		repository.SetTransaction(tx)

		txErr := repository.BeforeUpdateReceipt(currentReceipt, updatedReceipt)
		if txErr != nil {
			return txErr
		}

		txErr = tx.Session(&gorm.Session{FullSaveAssociations: true}).Model(&currentReceipt).Updates(&updatedReceipt).Error
		if txErr != nil {
			return txErr
		}

		txErr = tx.Model(&currentReceipt).Association("Tags").Replace(&updatedReceipt.Tags)
		if txErr != nil {
			return txErr
		}

		txErr = tx.Model(&currentReceipt).Association("Categories").Replace(&updatedReceipt.Categories)
		if txErr != nil {
			return txErr
		}

		err = repository.AfterReceiptUpdated(&updatedReceipt)
		if err != nil {
			return err
		}

		repository.ClearTransaction()
		return nil
	})
	if err != nil {
		createFailedUpdateSystemTask(systemTask, err)
		return models.Receipt{}, err
	}

	fullyLoadedReceipt, err := repository.GetFullyLoadedReceiptById(id)
	if err != nil {
		createFailedUpdateSystemTask(systemTask, err)
		return models.Receipt{}, err
	}

	after, err := fullyLoadedReceipt.ToString()
	if err != nil {
		createFailedUpdateSystemTask(systemTask, err)
		return models.Receipt{}, err
	}

	systemTaskResultDescription["after"] = after
	systemTaskResultDescription["version"] = ReceiptUpdateDescriptionVersion
	endedAt = time.Now()
	systemTask.EndedAt = &endedAt

	resultDescriptionBytes, err := json.Marshal(systemTaskResultDescription)
	if err != nil {
		createFailedUpdateSystemTask(systemTask, err)
		return models.Receipt{}, err
	}
	systemTask.ResultDescription = string(resultDescriptionBytes)

	systemTaskRepository := NewSystemTaskRepository(nil)
	_, err = systemTaskRepository.CreateSystemTask(systemTask)
	if err != nil {
		createFailedUpdateSystemTask(systemTask, err)
		return models.Receipt{}, err
	}

	return fullyLoadedReceipt, nil
}

// AfterReceiptUpdated keeps resolved_date in step with the status: RESOLVED stamps it, any other status clears it.
// DECLINED is deliberately not a resolution, and reports expose that column.
func (repository ReceiptRepository) AfterReceiptUpdated(updatedReceipt *models.Receipt) error {
	db := repository.GetDB()

	var err error
	if updatedReceipt.ID > 0 && updatedReceipt.Status == models.RESOLVED && updatedReceipt.ResolvedDate == nil {
		now := time.Now().UTC()
		err = db.Table("receipts").Where("id = ?", updatedReceipt.ID).Update("resolved_date", now).Error
	} else if updatedReceipt.ID > 0 && updatedReceipt.Status != models.RESOLVED && updatedReceipt.ResolvedDate != nil {
		err = db.Table("receipts").Where("id = ?", updatedReceipt.ID).Update("resolved_date", nil).Error
	}

	return err
}

func (repository ReceiptRepository) CreateReceipt(
	command commands.UpsertReceiptCommand,
	createdByUserID uint,
	createSystemTask bool,
) (models.Receipt, error) {
	db := repository.GetDB()
	notificationRepository := NewNotificationRepository(nil)
	receipt, err := command.ToReceipt()
	if err != nil {
		return models.Receipt{}, err
	}
	NormalizeReceiptCalendarDates(&receipt)

	if receipt.GroupId > 0 {
		receipt.CreatedBy = &createdByUserID
	}

	systemTask := commands.UpsertSystemTaskCommand{
		Type:                 models.RECEIPT_UPLOADED,
		AssociatedEntityType: models.RECEIPT,
		StartedAt:            time.Now(),
		Status:               models.SYSTEM_TASK_SUCCEEDED,
		RanByUserId:          &createdByUserID,
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		repository.SetTransaction(tx)
		notificationRepository.SetTransaction(tx)

		err := tx.Model(models.Receipt{}).Select("*").Create(&receipt).Error
		if err != nil {
			return err
		}

		var userIdsToOmit []interface{} = make([]interface{}, 1)
		userIdsToOmit = append(userIdsToOmit, *receipt.CreatedBy)

		notificationBody := fmt.Sprintf("The receipt: %s has been uploaded to the group %s. Check it out! %s", receipt.Name, BuildParamaterisedString("groupId", receipt.GroupId, "name", "string"), BuildParamaterisedString("receiptId", receipt.ID, "", "link"))
		err = notificationRepository.SendNotificationToGroup(receipt.GroupId, "Receipt Uploaded", notificationBody, models.NOTIFICATION_TYPE_NORMAL, userIdsToOmit)
		if err != nil {
			return err
		}

		err = repository.AfterReceiptUpdated(&receipt)
		if err != nil {
			return err
		}

		// Restore the DB/transaction this method was invoked with (captured as
		// `db` above) so the read-back below runs on the same connection that
		// created the receipt. Clearing to nil would fall back to a fresh pooled
		// connection which, when CreateReceipt runs inside an outer transaction
		// (e.g. QuickScan, email attachment ingest), cannot see the still
		// uncommitted receipt row and would return a zero-ID receipt.
		repository.SetTransaction(db)
		notificationRepository.ClearTransaction()
		return nil
	})
	// Only record the failure when this call owns the upload task. Quick scan and
	// email pass false because they record their own, failure included, as a child
	// of the task that ran them.
	if err != nil {
		if createSystemTask {
			createFailedUpdateSystemTask(systemTask, err)
		}
		return models.Receipt{}, err
	}

	fullyLoadedReceipt, err := repository.GetFullyLoadedReceiptById(utils.UintToString(receipt.ID))
	if err != nil {
		if createSystemTask {
			createFailedUpdateSystemTask(systemTask, err)
		}
		return models.Receipt{}, err
	}

	// GetFullyLoadedReceiptById uses Find, which returns an empty receipt (ID 0)
	// with no error when the row is not visible. Guard against that so callers get
	// a clear failure here instead of a downstream foreign key violation.
	if fullyLoadedReceipt.ID == 0 {
		err = fmt.Errorf("created receipt %s could not be reloaded", utils.UintToString(receipt.ID))
		if createSystemTask {
			createFailedUpdateSystemTask(systemTask, err)
		}
		return models.Receipt{}, err
	}

	if createSystemTask {
		endedAt := time.Now()
		systemTask.EndedAt = &endedAt
		systemTask.AssociatedEntityId = fullyLoadedReceipt.ID
		newReceiptString, err := fullyLoadedReceipt.ToString()
		if err != nil {
			return models.Receipt{}, err
		}

		systemTask.ReceiptId = &fullyLoadedReceipt.ID
		systemTask.GroupId = &fullyLoadedReceipt.GroupId
		systemTask.ResultDescription = newReceiptString

		systemTaskRepository := NewSystemTaskRepository(nil)
		_, err = systemTaskRepository.CreateSystemTask(systemTask)
		if err != nil {
			return models.Receipt{}, err
		}
	}

	return fullyLoadedReceipt, nil
}

func (repository ReceiptRepository) GetReceiptById(receiptId string) (models.Receipt, error) {
	db := repository.DB
	var receipt models.Receipt
	err := db.Model(models.Receipt{}).Where("id = ?", receiptId).First(&receipt).Debug().Error
	if err != nil {
		return models.Receipt{}, err
	}

	return receipt, nil
}

// GroupReadableResolver reports whether a user may read receipts in a group.
// It lets the receipt repository gate the synthetic "All group" expansion by the
// caller's per-group permission without importing the service layer: each caller
// supplies a closure bound to the permission its direct single-group path
// requires. Pass nil to GetPagedReceiptsByGroupId to skip the gate
// (internal/system callers).
//
// It is the only visibility rule on a receipt read: a member of a household sees
// all of its receipts. Paid-by visibility, the category and tag grants and member
// isolation, which each had a resolver here, went with fixed roles (2026-11).
type GroupReadableResolver func(groupId uint) (bool, error)

func (repository ReceiptRepository) GetPagedReceiptsByGroupId(
	userId uint,
	groupId string,
	pagedRequest commands.ReceiptPagedRequestCommand,
	associations []string,
	readableResolver GroupReadableResolver,
) ([]models.Receipt, int64, error) {
	var receipts []models.Receipt
	var count int64

	uintGroupId, err := utils.StringToUint(groupId)
	if err != nil {
		return nil, 0, err
	}
	groupRepository := NewGroupRepository(nil)
	isAllGroup, err := groupRepository.IsAllGroup(uintGroupId)
	if err != nil {
		return nil, 0, err
	}

	// Apply filter
	query, err := repository.BuildGormFilterQuery(pagedRequest)
	if err != nil {
		return nil, 0, err
	}

	// Filter receipts by group
	var memberGroupIds []uint
	if isAllGroup {
		groupMemberRepository := NewGroupMemberRepository(nil)
		memberGroupIds, err = groupMemberRepository.GetGroupIdsByUserId(utils.UintToString(userId))
		if err != nil {
			return nil, 0, err
		}

		// Gate the All-group expansion by the caller's per-group read permission.
		// The All group is a real membership where the caller holds an
		// unrestricted role, so without this a member could read receipts in every
		// group they belong to — including groups whose role denies receipt read.
		if readableResolver != nil {
			readable := make([]uint, 0, len(memberGroupIds))
			for _, gid := range memberGroupIds {
				ok, resolveErr := readableResolver(gid)
				if resolveErr != nil {
					return nil, 0, resolveErr
				}
				if ok {
					readable = append(readable, gid)
				}
			}
			memberGroupIds = readable
		}

		query = query.Where("group_id IN ?", memberGroupIds)
	} else {
		query = query.Where("group_id = ?", groupId)
	}

	// Free-text search. The id list only narrows the group scope above; it sits before the count so
	// totalCount matches the rows returned.
	searchQuery := utils.NewFuzzyQuery(pagedRequest.Filter.Search)
	if !searchQuery.Empty() {
		searchScope := memberGroupIds
		if !isAllGroup {
			searchScope = []uint{uintGroupId}
		}

		matchedIds, searchErr := repository.fuzzySearchReceiptIds(searchScope, searchQuery)
		if searchErr != nil {
			return nil, 0, searchErr
		}
		query = query.Where("receipts.id IN ?", matchedIds)
	}

	// Set order by
	if len(pagedRequest.OrderBy) == 0 {
		pagedRequest.OrderBy = constants.DEFAULT_RECEIPT_ORDER_BY
	}

	if !commands.IsValidSortDirection(pagedRequest.SortDirection) {
		return nil, 0, errors.New("untrusted value " + pagedRequest.OrderBy + " " + string(pagedRequest.SortDirection))
	}

	if pagedRequest.OrderBy == constants.FIRST_COMMENT_ORDER_BY {
		query = repository.orderByFirstComment(query, pagedRequest.SortDirection)
	} else if repository.isTrustedValue(pagedRequest) {
		orderBy := pagedRequest.OrderBy
		if orderBy == "shop_name" {
			// The table's Shop column shows the shop, or the receipt's name when none was read, so
			// it sorts the same way. Both operands are hardcoded columns.
			orderBy = "COALESCE(NULLIF(receipts.shop_name, ''), receipts.name)"
		}
		query = query.Order(orderBy + " " + string(pagedRequest.SortDirection))
	} else {
		return nil, 0, errors.New("untrusted value " + pagedRequest.OrderBy + " " + string(pagedRequest.SortDirection))
	}

	err = query.Count(&count).Error
	if err != nil {
		return nil, 0, err
	}

	query = query.Preload("Categories").Preload("Tags")

	if pagedRequest.PageSize > 0 && pagedRequest.Page > 0 {
		query = query.Scopes(repository.Paginate(pagedRequest.Page, pagedRequest.PageSize))
	}

	if len(associations) > 0 {
		for _, association := range associations {
			query = query.Preload(association)
		}
	}

	// Run Query
	err = query.Find(&receipts).Error
	if err != nil {
		return nil, 0, err
	}

	return receipts, count, nil
}

func (repository ReceiptRepository) BuildGormFilterQuery(pagedRequest commands.ReceiptPagedRequestCommand) (*gorm.DB, error) {
	query := repository.GetDB().Model(models.Receipt{})
	// The category and tag subqueries are built on the repository's own database (never the process one).
	db := repository.DB
	// Name
	if pagedRequest.Filter.Name.Value != nil {
		name := pagedRequest.Filter.Name.Value.(string)
		if len(name) > 0 {
			query = repository.BuildFilterQuery(query, name, pagedRequest.Filter.Name.Operation, "name", false)
		}
	}

	// The three dates are compared as whole calendar days. A receipt's Date is a
	// calendar day stored as midnight UTC, so its days are UTC days; Resolved
	// Date and Added At are instants, so theirs are the app zone's. "Today" for
	// WITHIN_CURRENT_MONTH is always the app zone's. See BuildDayFilterQuery.
	appLocation := repository.AppLocation()

	// Warranties that end today or later; warranty_until is a "yyyy-MM-dd" day, so this compares as text.
	if pagedRequest.Filter.WarrantyActive {
		query = query.Where("receipts.warranty_until IS NOT NULL AND receipts.warranty_until >= ?", time.Now().In(appLocation).Format(time.DateOnly))
	}
	if endsBy, err := time.Parse(time.DateOnly, pagedRequest.Filter.WarrantyEndsBy); err == nil {
		query = query.Where("receipts.warranty_until IS NOT NULL AND receipts.warranty_until <= ?", endsBy.Format(time.DateOnly))
	}

	// Date
	query = repository.BuildDayFilterQuery(
		query,
		pagedRequest.Filter.Date.Value,
		pagedRequest.Filter.Date.Operation,
		"date",
		time.UTC,
		appLocation,
	)

	// Paid By
	if pagedRequest.Filter.PaidBy.Value != nil {
		paidBy := pagedRequest.Filter.PaidBy.Value.([]interface{})
		if len(paidBy) > 0 {
			query = repository.BuildFilterQuery(query, paidBy, pagedRequest.Filter.PaidBy.Operation, "paid_by_user_id", true)
		}
	}

	// Categories
	if pagedRequest.Filter.Categories.Value != nil {
		categories := pagedRequest.Filter.Categories.Value.([]interface{})
		if len(categories) > 0 {
			if pagedRequest.Filter.Categories.Operation == commands.CONTAINS {
				// A receipt's own categories (older data) or those of its product lines.
				query = query.Where(db.
					Where("id IN (?)", db.Table("receipt_categories").Select("receipt_id").Where("category_id IN ?", categories)).
					Or("id IN (?)", db.Table("receipt_products").Select("receipt_id").Where("category_id IN ?", categories)))
			}
		}

	}

	// Tags
	if pagedRequest.Filter.Tags.Value != nil {
		tags := pagedRequest.Filter.Tags.Value.([]interface{})
		if len(tags) > 0 {
			if pagedRequest.Filter.Tags.Operation == commands.CONTAINS {
				// A receipt's own tags (older data) or those of its product lines.
				query = query.Where(db.
					Where("id IN (?)", db.Table("receipt_tags").Select("receipt_id").Where("tag_id IN ?", tags)).
					Or("id IN (?)", db.Table("receipt_products").Select("receipt_products.receipt_id").
						Joins("JOIN receipt_product_tags ON receipt_product_tags.receipt_product_id = receipt_products.id").
						Where("receipt_product_tags.tag_id IN ?", tags)))
			}
		}
	}

	// Amount
	if pagedRequest.Filter.Amount.Value != nil {
		var amount interface{}
		if pagedRequest.Filter.Amount.Operation == commands.BETWEEN {
			amount = pagedRequest.Filter.Amount.Value.([]interface{})
		} else {
			amount = pagedRequest.Filter.Amount.Value.(float64)
		}
		query = repository.BuildFilterQuery(
			query,
			amount,
			pagedRequest.Filter.Amount.Operation,
			"amount", pagedRequest.Filter.Amount.Operation == commands.BETWEEN,
		)
	}

	// Status
	if pagedRequest.Filter.Status.Value != nil {
		status := pagedRequest.Filter.Status.Value.([]interface{})
		if len(status) > 0 {
			query = repository.BuildFilterQuery(query, status, pagedRequest.Filter.Status.Operation, "status", true)
		}
	}

	// Group
	if pagedRequest.Filter.Group.Value != nil {
		groups := pagedRequest.Filter.Group.Value.([]interface{})
		if len(groups) > 0 {
			query = repository.BuildFilterQuery(query, groups, pagedRequest.Filter.Group.Operation, "group_id", true)
		}
	}

	// Resolved Date
	query = repository.BuildDayFilterQuery(
		query,
		pagedRequest.Filter.ResolvedDate.Value,
		pagedRequest.Filter.ResolvedDate.Operation,
		"resolved_date",
		appLocation,
		appLocation,
	)

	// Added At
	query = repository.BuildDayFilterQuery(
		query,
		pagedRequest.Filter.CreatedAt.Value,
		pagedRequest.Filter.CreatedAt.Operation,
		"created_at",
		appLocation,
		appLocation,
	)

	return query, nil
}

// orderByFirstComment orders query by the text of each receipt's first comment
// (firstCommentOrder), read with a correlated subquery: a receipt has many
// comments, and a join would multiply its rows and corrupt the count and pagination.
func (repository ReceiptRepository) orderByFirstComment(query *gorm.DB, sortDirection commands.SortDirection) *gorm.DB {
	commentQuery := repository.GetDB().
		Model(&models.Comment{}).
		Select("comments.comment").
		Where("comments.receipt_id = receipts.id").
		Order(firstCommentOrder).
		Limit(1)

	return repository.orderBySubquery(query, commentQuery, sortDirection)
}

// orderBySubquery orders query by the value valueQuery - a correlated subquery
// against the outer receipts row - yields for each receipt.
//
// The direction and the tiebreaker have to live in this one expression.
// clause.OrderBy builds its Expression *instead of* its Columns and Desc, and
// a second Order() call would silently replace this clause rather than append
// to it. The tiebreaker is not cosmetic: a boolean or select field has a
// handful of distinct values, many receipts have no comment at all, and
// without a unique last term LIMIT/OFFSET paging repeats and skips rows between
// pages.
//
// Because Columns and Desc are unavailable here, this is the one ordering path
// that cannot delegate to BaseRepository.Sort. The keyword is therefore chosen
// from literals rather than built from sortDirection, so the caller's string
// never reaches the SQL even if a future call site skips IsValidSortDirection.
func (repository ReceiptRepository) orderBySubquery(
	query *gorm.DB,
	valueQuery *gorm.DB,
	sortDirection commands.SortDirection,
) *gorm.DB {
	direction := "ASC"
	if sortDirection == commands.DESCENDING {
		direction = "DESC"
	}

	return query.Order(clause.OrderBy{Expression: clause.Expr{
		SQL:  "(?) " + direction + ", receipts.id DESC",
		Vars: []any{valueQuery},
	}})
}

func (repository ReceiptRepository) isTrustedValue(pagedRequest commands.ReceiptPagedRequestCommand) bool {
	orderByTrusted := []interface{}{"date", "name", "shop_name", "paid_by_user_id", "amount", "categories", "tags", "status", "resolved_date", "created_at", "warranty_until"}
	directionTrusted := commands.GetValidSortDirections()

	isOrderByTrusted := utils.Contains(orderByTrusted, pagedRequest.OrderBy)
	isDirectionTrusted := utils.Contains(directionTrusted, pagedRequest.SortDirection)

	return isOrderByTrusted && isDirectionTrusted
}

func (repository ReceiptRepository) GetReceiptGroupIdByReceiptId(id string) (uint, error) {
	db := repository.GetDB()
	var receipt models.Receipt

	err := db.Model(models.Receipt{}).Where("id = ?", id).Select("group_id").Find(&receipt).Error
	if err != nil {
		return 0, err
	}

	return receipt.GroupId, nil
}

// GetReceiptForAuthorization loads only the fields needed to authorize a receipt
// read (id, group_id, paid_by_user_id). It uses First, so a missing row returns
// gorm.ErrRecordNotFound — letting callers authorize (and detect not-found)
// before paying to preload the full receipt's associations.
func (repository ReceiptRepository) GetReceiptForAuthorization(id string) (models.Receipt, error) {
	db := repository.GetDB()
	var receipt models.Receipt

	err := db.Model(models.Receipt{}).
		Where("id = ?", id).
		Select("id", "group_id", "paid_by_user_id").
		First(&receipt).Error
	if err != nil {
		return models.Receipt{}, err
	}

	return receipt, nil
}

func (repository ReceiptRepository) GetFullyLoadedReceiptById(id string) (models.Receipt, error) {
	db := repository.GetDB()
	var receipt models.Receipt

	query := db.Model(models.Receipt{}).Where("id = ?", id).Preload(clause.Associations)

	for _, association := range constants.FULL_RECEIPT_ASSOCIATIONS {
		query = query.Preload(association)
	}

	err := query.Find(&receipt).Error
	if err != nil {
		return models.Receipt{}, err
	}

	return receipt, nil
}

// SearchReceiptsByGroupIds returns receipts within the given groups whose name
// matches nameQuery (a substring match; an empty nameQuery matches all),
// ordered by most recent date first and capped at limit. Scoping to the
// caller's group ids is the caller's responsibility.
func (repository ReceiptRepository) SearchReceiptsByGroupIds(groupIds []uint, nameQuery string, limit int) ([]models.Receipt, error) {
	db := repository.GetDB()
	var receipts []models.Receipt

	// With no household there is nothing to see.
	if len(groupIds) == 0 {
		return receipts, nil
	}

	query := db.Model(models.Receipt{}).Where("group_id IN ?", groupIds)
	if len(nameQuery) > 0 {
		query = query.Where("name LIKE ?", "%"+nameQuery+"%")
	}

	err := query.Order("date desc").Limit(limit).Find(&receipts).Error
	if err != nil {
		return nil, err
	}

	return receipts, nil
}

func (repository ReceiptRepository) GetReceiptsByIds(ids []string, associations []string) ([]models.Receipt, error) {
	query := repository.GetDB().Model(models.Receipt{}).Where("id IN ?", ids)

	for _, association := range associations {
		query = query.Preload(association)
	}

	var receipts []models.Receipt
	err := query.Find(&receipts).Error
	if err != nil {
		return nil, err
	}

	return receipts, nil
}
