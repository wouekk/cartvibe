package repositories

import (
	"fmt"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

type TagsRepository struct {
	BaseRepository
}

func NewTagsRepository(tx *gorm.DB) TagsRepository {
	repository := TagsRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX: tx,
	}}
	return repository
}

func (repository TagsRepository) GetAllTags(querySelect string) ([]models.Tag, error) {
	db := repository.GetDB()
	var tags []models.Tag

	err := db.Table("tags").Select(querySelect).Find(&tags).Error
	if err != nil {
		return nil, err
	}

	return tags, nil
}

// GetByIds returns the full tag records for the given ids (order not guaranteed). Used to resolve
// names for id-only selections (e.g. quick-scan tag picks) so they can flow through receipt
// validation, which requires a tag name.
func (repository TagsRepository) GetByIds(ids []uint) ([]models.Tag, error) {
	db := repository.GetDB()
	var tags []models.Tag

	if len(ids) == 0 {
		return tags, nil
	}

	err := db.Model(&models.Tag{}).Where("id IN ?", ids).Find(&tags).Error
	if err != nil {
		return nil, err
	}

	return tags, nil
}

// CountByIds returns how many of the given tag ids exist. Used to validate that
// a role's tag grants reference real tags. Duplicate ids in the input are
// de-duplicated by the IN clause, so callers should pass a unique set.
func (repository TagsRepository) CountByIds(ids []uint) (int64, error) {
	db := repository.GetDB()

	var count int64
	err := db.Model(&models.Tag{}).Where("id IN ?", ids).Count(&count).Error
	if err != nil {
		return 0, err
	}

	return count, nil
}

func (repository TagsRepository) CreateTag(command commands.UpsertTagCommand) (models.Tag, error) {
	db := repository.GetDB()
	tag := models.Tag{}

	tag.Name = command.Name
	tag.Description = command.Description
	if command.ShowOnDashboard != nil {
		tag.ShowOnDashboard = *command.ShowOnDashboard
	}

	err := db.Model(&tag).Create(&tag).Error
	if err != nil {
		return models.Tag{}, err
	}

	return tag, nil
}

func (repository TagsRepository) GetAllPagedTags(pagedRequestCommand commands.PagedRequestCommand) ([]models.TagView, error) {
	db := repository.GetDB()
	var tags []models.TagView
	quotedAlias := "\"NumberOfReceipts\""

	if pagedRequestCommand.OrderBy == "numberOfReceipts" {
		pagedRequestCommand.OrderBy = quotedAlias
	}

	if pagedRequestCommand.OrderBy == "numberOfProducts" {
		pagedRequestCommand.OrderBy = "\"NumberOfProducts\""
	}

	pagedRequestCommand.OrderBy = qualifyColumn("tags", pagedRequestCommand.OrderBy)

	// Tags label product lines now; NumberOfReceipts still counts the receipt-level tags of older data.
	query := repository.Sort(db, pagedRequestCommand.OrderBy, pagedRequestCommand.SortDirection)
	query = query.Scopes(repository.Paginate(pagedRequestCommand.Page, pagedRequestCommand.PageSize))
	selectString := fmt.Sprintf("tags.id, tags.name, tags.description, tags.show_on_dashboard, COUNT(DISTINCT receipt_tags.receipt_id) as %s, COUNT(DISTINCT receipt_product_tags.receipt_product_id) as \"NumberOfProducts\"", quotedAlias)
	query = query.Table("tags").
		Select(selectString).
		Joins("LEFT JOIN receipt_tags ON tags.id = receipt_tags.tag_id").
		Joins("LEFT JOIN receipt_product_tags ON tags.id = receipt_product_tags.tag_id").
		Group("tags.id, tags.name, tags.description, tags.show_on_dashboard")

	err := query.Scan(&tags).Error
	if err != nil {
		return nil, err
	}

	return tags, nil
}

func (repository TagsRepository) UpdateTag(tagId string, command commands.UpsertTagCommand) (models.Tag, error) {
	db := repository.GetDB()
	var updatedTag models.Tag

	// A map, not the command: Updates with a struct skips zero values, so a cleared description or a tile
	// switched off would never be saved.
	updates := map[string]any{
		"name":        command.Name,
		"description": command.Description,
	}
	if command.ShowOnDashboard != nil {
		updates["show_on_dashboard"] = *command.ShowOnDashboard
	}

	err := db.Model(models.Tag{}).Where("id = ?", tagId).Updates(updates).Error
	if err != nil {
		return models.Tag{}, err
	}

	err = db.Model(models.Tag{}).Where("id = ?", tagId).Find(&updatedTag).Error
	if err != nil {
		return models.Tag{}, err
	}

	return updatedTag, nil
}

func (repository TagsRepository) DeleteTag(tagId uint) error {
	db := repository.GetDB()

	err := db.Transaction(func(tx *gorm.DB) error {
		err := tx.Delete(&models.ReceiptTag{}, "tag_id = ?", tagId).Error
		if err != nil {
			return err
		}

		err = tx.Table("receipt_product_tags").Where("tag_id = ?", tagId).Delete(&struct{}{}).Error
		if err != nil {
			return err
		}

		err = tx.Where("id = ?", tagId).Delete(&models.Tag{}).Error
		if err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return err
	}

	return nil
}
