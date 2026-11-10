package models

// MaxCommentLength is the maximum length of a comment, in characters. SQLite does not enforce the
// varchar(500) of the column below, so this check is the only limit: callers that accept a comment
// from a user reject an over-length one up front.
const MaxCommentLength = 500

type Comment struct {
	BaseModel
	Comment string  `gorm:"type:varchar(500); not null" json:"comment"`
	Receipt Receipt `json:"-"`
	// Indexed for the receipts table's Comment column, which both sorts on a
	// receipt's first comment (a correlated subquery per candidate receipt) and
	// loads the first comment of every receipt on a page. Without it both are a
	// full scan of this table (SQLite makes no index for a foreign key).
	ReceiptId      uint      `gorm:"index:idx_comment_receipt_id" json:"receiptId"`
	User           User      `json:"-"`
	UserId         *uint     `json:"userId"`
	AdditionalInfo string    `gorm:"type:varchar(500)" json:"additionalInfo"`
	CommentId      *uint     `json:"commentId"`
	Replies        []Comment `json:"replies"`
}
