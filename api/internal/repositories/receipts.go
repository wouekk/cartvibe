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
		TX: tx,
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
	db := GetDB()
	var receipt models.Receipt
	err := db.Model(models.Receipt{}).Where("id = ?", receiptId).First(&receipt).Debug().Error
	if err != nil {
		return models.Receipt{}, err
	}

	return receipt, nil
}

// PaidByAllowedResolver returns the paid_by_user_id values a user may see in a
// group, and whether they are unrestricted (see every payer). It lets the receipt
// repository apply the role-based "paid by" visibility filter without importing
// the service layer that resolves grants. Pass a nil resolver to
// GetPagedReceiptsByGroupId to skip paid-by filtering entirely (internal/system
// callers).
type PaidByAllowedResolver func(groupId uint) (allowedUserIds []uint, unrestricted bool, err error)

// CommentAuthorVisibilityResolver returns the comment authors a user may see in a
// group under member isolation, or unrestricted == true (see every author). It is
// what keeps a sort by first comment from ordering receipts by a comment the
// caller is never shown. Pass nil to GetPagedReceiptsByGroupId to skip it
// (internal/system callers), exactly like a nil PaidByAllowedResolver.
type CommentAuthorVisibilityResolver func(groupId uint) (visibleUserIds []uint, unrestricted bool, err error)

// GroupReadableResolver reports whether a user may read receipts in a group.
// It lets the receipt repository gate the synthetic "All group" expansion by the
// caller's per-group permission without importing the service layer — each caller
// supplies a closure bound to the permission its direct single-group path
// requires. Pass nil to GetPagedReceiptsByGroupId to skip the gate
// (internal/system callers), exactly like a nil PaidByAllowedResolver.
type GroupReadableResolver func(groupId uint) (bool, error)

// CategoryTagVisibility is one group's resolved category/tag grant sets. An
// *Unrestricted flag (with a nil/empty set) means "see every id of that resource
// in this group" and folds in the app-level catalog bypass.
type CategoryTagVisibility struct {
	CategoryAllowed      map[uint]struct{}
	CategoryUnrestricted bool
	TagAllowed           map[uint]struct{}
	TagUnrestricted      bool
}

// CategoryTagVisibilityResolver returns a group's category/tag visibility. It is
// used to narrow a category/tag FILTER per group in the All-group view, so a
// filter on an id only matches receipts in groups where that id is visible to the
// caller. Pass nil to GetPagedReceiptsByGroupId to skip per-group filter narrowing
// (internal/system callers), exactly like a nil PaidByAllowedResolver.
type CategoryTagVisibilityResolver func(groupId uint) (CategoryTagVisibility, error)

func (repository ReceiptRepository) GetPagedReceiptsByGroupId(
	userId uint,
	groupId string,
	pagedRequest commands.ReceiptPagedRequestCommand,
	associations []string,
	paidByResolver PaidByAllowedResolver,
	commentAuthorResolver CommentAuthorVisibilityResolver,
	readableResolver GroupReadableResolver,
	categoryTagResolver CategoryTagVisibilityResolver,
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

	// The All-group read gate and the per-group category/tag narrowing must move
	// as a pair: readableResolver drops groups the caller can't read, and
	// categoryTagResolver scopes the category/tag filter per group. Supplying
	// only one silently reopens a cross-group leak — a readable resolver without
	// the category/tag one lets a category/tag filter fall through to
	// BuildGormFilterQuery's flat, group-unscoped subquery (matching restricted
	// ids across groups), and the reverse expands the read set to groups the
	// caller can't read. Fail closed and loud so a half-wired caller trips here
	// instead of leaking. Single-group reads pass neither (both nil is allowed).
	if isAllGroup && (readableResolver == nil) != (categoryTagResolver == nil) {
		return nil, 0, errors.New("all-group read requires both readable and category/tag resolvers")
	}

	// For the All-group view, apply the per-group category/tag FILTER as a
	// disjunction below instead of the flat, group-unscoped subquery
	// BuildGormFilterQuery emits — otherwise a caller could filter by a category
	// id they can't see in a group and still match that group's receipts. Build
	// the base filter WITHOUT the category/tag terms in that case (on a copy, so
	// the caller's command is untouched); the real per-group narrowing is added
	// after the group scope.
	perGroupCatTag := isAllGroup && categoryTagResolver != nil
	filterForBuild := pagedRequest
	if perGroupCatTag {
		filterForBuild.Filter.Categories = commands.PagedRequestField{}
		filterForBuild.Filter.Tags = commands.PagedRequestField{}
	}

	// Apply filter
	query, err := repository.BuildGormFilterQuery(filterForBuild)
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

	// Free-text search. The id list only narrows the group scope above, so it can never show a
	// receipt the paid-by and category/tag rules below would hide; it sits before the count so
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

	// Apply role-based "paid by" visibility, AND-ed with the group scope above and
	// BEFORE the count below so totalCount matches the rows actually returned (a
	// post-fetch filter would corrupt pagination).
	if paidByResolver != nil {
		query, err = repository.applyPaidByVisibility(query, uintGroupId, isAllGroup, memberGroupIds, paidByResolver)
		if err != nil {
			return nil, 0, err
		}
	}

	// Apply the per-group category/tag filter disjunction for the All-group view
	// (see perGroupCatTag above). AND-ed before the count so pagination/totalCount
	// stay correct, exactly like the paid-by disjunction.
	if perGroupCatTag {
		query, err = repository.applyAllGroupCategoryTagFilter(query, memberGroupIds, pagedRequest.Filter, categoryTagResolver)
		if err != nil {
			return nil, 0, err
		}
	}

	// Set order by
	if len(pagedRequest.OrderBy) == 0 {
		pagedRequest.OrderBy = constants.DEFAULT_RECEIPT_ORDER_BY
	}

	if !commands.IsValidSortDirection(pagedRequest.SortDirection) {
		return nil, 0, errors.New("untrusted value " + pagedRequest.OrderBy + " " + string(pagedRequest.SortDirection))
	}

	if pagedRequest.OrderBy == constants.FIRST_COMMENT_ORDER_BY {
		groupIds := []uint{uintGroupId}
		if isAllGroup {
			groupIds = memberGroupIds
		}
		query, err = repository.orderByFirstComment(query, groupIds, commentAuthorResolver, pagedRequest.SortDirection)
		if err != nil {
			return nil, 0, err
		}
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

	if associations != nil && len(associations) > 0 {
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

// applyPaidByVisibility narrows query to the receipts a user may see by the
// "paid by" user, using resolver to look up each group's allowed set. For a
// single group it adds a simple paid_by_user_id IN (...) constraint; for the
// all-group view it builds a per-group disjunction so each group applies its own
// allowed set (a member may hold a different group role per group). The whole
// disjunction is AND-ed onto query, preserving the existing group scope and
// keeping the row count correct.
func (repository ReceiptRepository) applyPaidByVisibility(
	query *gorm.DB,
	uintGroupId uint,
	isAllGroup bool,
	memberGroupIds []uint,
	resolver PaidByAllowedResolver,
) (*gorm.DB, error) {
	if !isAllGroup {
		allowed, unrestricted, err := resolver(uintGroupId)
		if err != nil {
			return nil, err
		}
		if unrestricted {
			return query, nil
		}
		return query.Where("paid_by_user_id IN ?", paidByInValues(allowed)), nil
	}

	return repository.ApplyPaidByDisjunction(query, memberGroupIds, resolver)
}

// ApplyPaidByDisjunction AND-s a per-group "paid by" visibility disjunction onto
// query across memberGroupIds: each group contributes either `group_id = G`
// (unrestricted) or `(group_id = G AND paid_by_user_id IN (allowed))`, OR-ed
// together. It is shared by the all-group paged read and by search — both scope
// receipts to a member's groups and must apply each group's own paid-by role in
// SQL, BEFORE any LIMIT, so visible rows are not lost to a pre-filter row cap.
func (repository ReceiptRepository) ApplyPaidByDisjunction(
	query *gorm.DB,
	memberGroupIds []uint,
	resolver PaidByAllowedResolver,
) (*gorm.DB, error) {
	// memberGroupIds is the caller's member groups. With none, there is nothing to
	// see — fail closed explicitly rather than leave the (empty) disjunction as a
	// silent no-op that adds no predicate, mirroring the single-group IN (0) guard.
	if len(memberGroupIds) == 0 {
		return query.Where("1 = 0"), nil
	}

	disjunction := repository.GetDB().Session(&gorm.Session{NewDB: true})
	for _, groupId := range memberGroupIds {
		allowed, unrestricted, err := resolver(groupId)
		if err != nil {
			return nil, err
		}
		if unrestricted {
			disjunction = disjunction.Or("group_id = ?", groupId)
		} else {
			groupCondition := repository.GetDB().Session(&gorm.Session{NewDB: true}).
				Where("group_id = ?", groupId).
				Where("paid_by_user_id IN ?", paidByInValues(allowed))
			disjunction = disjunction.Or(groupCondition)
		}
	}

	return query.Where(disjunction), nil
}

// paidByInValues guards the IN clause against an empty restricted set: paid-by
// user ids start at 1, so 0 matches no receipt, yielding "see nothing" rather
// than a malformed IN (). A restricted role normally always has at least one id
// (a grant or the resolved self id), but a role whose only granted user was
// deleted lands here.
func paidByInValues(allowedUserIds []uint) []uint {
	if len(allowedUserIds) == 0 {
		return []uint{0}
	}
	return allowedUserIds
}

// applyAllGroupCategoryTagFilter AND-s per-group category/tag filter disjunctions
// onto query for the all-group view, so a filter on a category/tag id matches
// receipts only in the groups where that id is visible to the caller. It is a
// no-op when no CONTAINS category/tag filter is supplied (the plain group scope
// then stands). Mirrors ApplyPaidByDisjunction and is AND-ed before the count so
// totalCount/pagination stay correct.
func (repository ReceiptRepository) applyAllGroupCategoryTagFilter(
	query *gorm.DB,
	memberGroupIds []uint,
	filter commands.ReceiptPagedRequestFilter,
	resolver CategoryTagVisibilityResolver,
) (*gorm.DB, error) {
	categoryIds := containsFilterIds(filter.Categories)
	tagIds := containsFilterIds(filter.Tags)
	if len(categoryIds) == 0 && len(tagIds) == 0 {
		return query, nil
	}
	if len(memberGroupIds) == 0 {
		return query.Where("1 = 0"), nil
	}

	// Resolve each group's visibility at most once (shared across category + tag).
	vis := make(map[uint]CategoryTagVisibility, len(memberGroupIds))
	for _, gid := range memberGroupIds {
		v, err := resolver(gid)
		if err != nil {
			return nil, err
		}
		vis[gid] = v
	}

	if len(categoryIds) > 0 {
		query = query.Where(repository.resourceFilterDisjunction(
			memberGroupIds, categoryIds, "receipt_categories", "category_id", vis,
			func(v CategoryTagVisibility) (map[uint]struct{}, bool) {
				return v.CategoryAllowed, v.CategoryUnrestricted
			}))
	}
	if len(tagIds) > 0 {
		query = query.Where(repository.resourceFilterDisjunction(
			memberGroupIds, tagIds, "receipt_tags", "tag_id", vis,
			func(v CategoryTagVisibility) (map[uint]struct{}, bool) {
				return v.TagAllowed, v.TagUnrestricted
			}))
	}
	return query, nil
}

// resourceFilterDisjunction builds an OR-of-branches, one per member group: a
// receipt in group G matches only via the requested ids that are visible to the
// caller in G. A group where none of the requested ids are visible contributes
// `group_id = G AND 1 = 0` (no rows) — this is what closes the "filter probe" on
// a restricted category/tag.
func (repository ReceiptRepository) resourceFilterDisjunction(
	memberGroupIds []uint,
	requestedIds []uint,
	joinTable string,
	idColumn string,
	vis map[uint]CategoryTagVisibility,
	pick func(CategoryTagVisibility) (map[uint]struct{}, bool),
) *gorm.DB {
	disjunction := repository.GetDB().Session(&gorm.Session{NewDB: true})
	for _, gid := range memberGroupIds {
		allowed, unrestricted := pick(vis[gid])
		branch := repository.GetDB().Session(&gorm.Session{NewDB: true}).Where("group_id = ?", gid)

		effective := requestedIds
		if !unrestricted {
			effective = intersectIds(requestedIds, allowed)
		}
		if len(effective) == 0 {
			branch = branch.Where("1 = 0")
		} else {
			sub := repository.GetDB().Session(&gorm.Session{NewDB: true}).
				Table(joinTable).Select("receipt_id").
				Where(idColumn+" IN ?", effective)
			branch = branch.Where("id IN (?)", sub)
		}
		disjunction = disjunction.Or(branch)
	}
	return disjunction
}

// containsFilterIds returns a CONTAINS filter field's ids as uint, or nil when the
// field is unset or is not a non-empty CONTAINS list.
func containsFilterIds(field commands.PagedRequestField) []uint {
	if field.Operation != commands.CONTAINS || field.Value == nil {
		return nil
	}
	values, ok := field.Value.([]interface{})
	if !ok || len(values) == 0 {
		return nil
	}
	out := make([]uint, 0, len(values))
	for _, v := range values {
		if id, ok := utils.FilterValueToUint(v); ok {
			out = append(out, id)
		}
	}
	return out
}

func intersectIds(requested []uint, allowed map[uint]struct{}) []uint {
	out := make([]uint, 0, len(requested))
	for _, id := range requested {
		if _, ok := allowed[id]; ok {
			out = append(out, id)
		}
	}
	return out
}

func (repository ReceiptRepository) BuildGormFilterQuery(pagedRequest commands.ReceiptPagedRequestCommand) (*gorm.DB, error) {
	query := repository.GetDB().Model(models.Receipt{})
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
//
// Only a comment the caller may see is a candidate. Member isolation drops a
// comment by an author the caller cannot see from every response, so sorting on
// it would order the table by text that is never shown - and would leak it, one
// comparison at a time. groupIds is the set of groups the query spans (one, or
// the caller's member groups for the All group), so each receipt is judged by its
// own group's visibility.
func (repository ReceiptRepository) orderByFirstComment(
	query *gorm.DB,
	groupIds []uint,
	resolver CommentAuthorVisibilityResolver,
	sortDirection commands.SortDirection,
) (*gorm.DB, error) {
	commentQuery := repository.GetDB().
		Model(&models.Comment{}).
		Select("comments.comment").
		Where("comments.receipt_id = receipts.id").
		Order(firstCommentOrder).
		Limit(1)

	visibility, err := repository.commentAuthorVisibility(groupIds, resolver)
	if err != nil {
		return nil, err
	}
	if visibility != nil {
		commentQuery = commentQuery.Where(visibility)
	}

	return repository.orderBySubquery(query, commentQuery, sortDirection), nil
}

// commentAuthorVisibility builds the predicate restricting a first-comment
// subquery to authors the caller may see, as a per-group disjunction on the outer
// receipt's group mirroring SystemTaskRepository.applyActivityVisibilityDisjunction:
// an unrestricted group contributes `receipts.group_id = G`, a restricted one
// `receipts.group_id = G AND (comments.user_id IS NULL OR comments.user_id IN (visible))`.
// A comment with no author names no one, so it stays visible - as it does in
// PermissionService's filterComments. Returns nil, adding no predicate at all, when
// there is no resolver or no group restricts the caller, which is every
// non-isolated install.
func (repository ReceiptRepository) commentAuthorVisibility(
	groupIds []uint,
	resolver CommentAuthorVisibilityResolver,
) (*gorm.DB, error) {
	if resolver == nil {
		return nil, nil
	}

	disjunction := repository.GetDB().Session(&gorm.Session{NewDB: true})
	restricted := false
	for _, groupId := range groupIds {
		visibleIds, unrestricted, err := resolver(groupId)
		if err != nil {
			return nil, err
		}
		if unrestricted {
			disjunction = disjunction.Or("receipts.group_id = ?", groupId)
			continue
		}

		restricted = true
		groupCondition := repository.GetDB().Session(&gorm.Session{NewDB: true}).
			Where("receipts.group_id = ?", groupId).
			// User ids start at 1, so paidByInValues' IN (0) guard applies unchanged.
			Where("(comments.user_id IS NULL OR comments.user_id IN ?)", paidByInValues(visibleIds))
		disjunction = disjunction.Or(groupCondition)
	}

	if !restricted {
		return nil, nil
	}
	return disjunction, nil
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

func (repository ReceiptRepository) GetReceiptsByGroupIds(groupIds []string, querySelect string, queryPreload string) ([]models.Receipt, error) {
	db := repository.GetDB()
	var receipts []models.Receipt

	query := db.Model(models.Receipt{}).Where("group_id IN ?", groupIds).Select(querySelect)
	if len(queryPreload) > 0 {
		query = query.Preload(queryPreload)
	}

	err := query.Find(&receipts).Error
	if err != nil {
		return nil, err
	}

	return receipts, nil
}

// SearchReceiptsByGroupIds returns receipts within the given groups whose name
// matches nameQuery (a substring match; an empty nameQuery matches all),
// ordered by most recent date first and capped at limit. Scoping to the
// caller's group ids is the caller's responsibility. The paidByResolver applies
// the caller's paid-by visibility in SQL BEFORE the limit, so hidden receipts
// can't push visible matches out of the capped result set.
func (repository ReceiptRepository) SearchReceiptsByGroupIds(groupIds []uint, nameQuery string, limit int, paidByResolver PaidByAllowedResolver) ([]models.Receipt, error) {
	db := repository.GetDB()
	var receipts []models.Receipt

	query := db.Model(models.Receipt{}).Where("group_id IN ?", groupIds)
	if len(nameQuery) > 0 {
		query = query.Where("name LIKE ?", "%"+nameQuery+"%")
	}

	query, err := repository.ApplyPaidByDisjunction(query, groupIds, paidByResolver)
	if err != nil {
		return nil, err
	}

	err = query.Order("date desc").Limit(limit).Find(&receipts).Error
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
