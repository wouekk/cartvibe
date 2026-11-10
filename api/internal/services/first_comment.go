package services

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

// This file backs the receipts table's Comment column: the text of each receipt's
// first comment, shown on the paged list and sortable on it.
//
// There is no permission of its own: reading a receipt already means reading its
// comments on every other surface, so group.receipts.read - the list's gate - is
// the gate here too.

// LoadFirstComments sets FirstComment on each receipt to the text of its earliest
// comment, leaving it nil when there is none. It loads the comments of the whole
// batch in one query.
func (service PermissionService) LoadFirstComments(receipts []models.Receipt) error {
	if len(receipts) == 0 {
		return nil
	}

	receiptIds := make([]uint, len(receipts))
	for i := range receipts {
		receiptIds[i] = receipts[i].ID
	}

	comments, err := repositories.NewCommentRepository(service.TX).GetCommentsForReceiptIds(receiptIds)
	if err != nil {
		return err
	}

	// comments arrive in first-comment order, so the first one seen for a receipt
	// is its first comment.
	firstByReceiptId := make(map[uint]string, len(receipts))
	for _, comment := range comments {
		if _, found := firstByReceiptId[comment.ReceiptId]; !found {
			firstByReceiptId[comment.ReceiptId] = comment.Comment
		}
	}

	for i := range receipts {
		if text, found := firstByReceiptId[receipts[i].ID]; found {
			receipts[i].FirstComment = &text
		}
	}

	return nil
}
