package repositories

import (
	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

const commentsToNoteMigration = "comments-to-note-v1"

// runCommentsToNoteMigration turns each receipt's thread of comments into its one note (audit D9), then drops
// the comments table. Nothing a person wrote is lost: a single comment becomes the note as written, several
// become one line each with the author's name in front (models.JoinCommentsIntoNote). Replies sit in the thread
// by the time they were written. A receipt without comments keeps an empty note.
//
// The table has to go, not just fall out of use: its rows point at receipts, so a receipt with comments could
// not be deleted any more once nothing removed them first.
func runCommentsToNoteMigration(tx *gorm.DB) error {
	if !tx.Migrator().HasTable("comments") {
		// A fresh install: there never were comments.
		return nil
	}

	var comments []struct {
		ReceiptId   uint
		Comment     string
		DisplayName string
		Username    string
	}
	err := tx.Table("comments").
		Select("comments.receipt_id AS receipt_id", "comments.comment AS comment",
			"users.display_name AS display_name", "users.username AS username").
		Joins("LEFT JOIN users ON users.id = comments.user_id").
		Order("comments.receipt_id, comments.created_at, comments.id").
		Find(&comments).Error
	if err != nil {
		return err
	}

	entries := map[uint][]models.NoteEntry{}
	order := []uint{}
	for _, comment := range comments {
		author := comment.DisplayName
		if author == "" {
			author = comment.Username
		}
		if _, seen := entries[comment.ReceiptId]; !seen {
			order = append(order, comment.ReceiptId)
		}
		entries[comment.ReceiptId] = append(entries[comment.ReceiptId], models.NoteEntry{Author: author, Text: comment.Comment})
	}

	for _, receiptId := range order {
		note := models.JoinCommentsIntoNote(entries[receiptId])
		if note == "" {
			continue
		}
		// Only where there is no note yet, so a second run (after a failure further down) changes nothing.
		err = tx.Table("receipts").Where("id = ? AND note = ?", receiptId, "").Update("note", note).Error
		if err != nil {
			return err
		}
	}

	return tx.Migrator().DropTable("comments")
}
