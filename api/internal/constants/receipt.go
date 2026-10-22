package constants

// DEFAULT_RECEIPT_ORDER_BY is the column a receipt list falls back to when the
// request names no sortable column of its own.
const DEFAULT_RECEIPT_ORDER_BY = "created_at"

// FIRST_COMMENT_ORDER_BY sorts a receipt list by each receipt's first comment. It
// is also the desktop receipts table's column key, so the two must agree.
const FIRST_COMMENT_ORDER_BY = "first_comment"

var FULL_RECEIPT_ASSOCIATIONS = []string{
	"PaidByUser",
	"ReceiptItems",
	"ReceiptItems.Categories",
	"ReceiptItems.Tags",
	"ReceiptItems.LinkedItems",
	"ReceiptItems.LinkedItems.Categories",
	"ReceiptItems.LinkedItems.Tags",
	"Comments",
	"ImageFiles",
}
