package constants

// DEFAULT_RECEIPT_ORDER_BY is the column a receipt list falls back to when the
// request names no sortable column of its own.
const DEFAULT_RECEIPT_ORDER_BY = "created_at"

// NOTE_ORDER_BY sorts a receipt list by each receipt's note. It is also the desktop receipts table's column
// key, so the two must agree.
const NOTE_ORDER_BY = "note"

// LEGACY_FIRST_COMMENT_ORDER_BY is what the Note column's key was while a receipt had a thread of comments. A
// browser keeps its table state, so the list still accepts it and sorts by the note.
const LEGACY_FIRST_COMMENT_ORDER_BY = "first_comment"

var FULL_RECEIPT_ASSOCIATIONS = []string{
	"PaidByUser",
	"ImageFiles",
}
