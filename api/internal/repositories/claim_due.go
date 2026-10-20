package repositories

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// claimLease is how long a claimed row is hidden from other sweeps. A sweep that dies mid-work leaves
// the row RUNNING; once the lease runs out the next sweep picks it up again.
const claimLease = 30 * time.Minute

// claimDue hands out one row of T that is due (a status in dueStatuses, next_attempt_at reached),
// oldest first, and marks it running with a lease. The claim is a conditional UPDATE, so two sweeps
// racing for one row cannot both win. keyColumn/keyOf name the row's primary key. ok is false when
// nothing is due.
func claimDue[T any, S ~string](
	db *gorm.DB,
	keyColumn string,
	keyOf func(*T) any,
	dueStatuses []S,
	running S,
	now time.Time,
) (row T, ok bool, err error) {
	// A handful of tries: losing a race just means another sweep took that row.
	for attempt := 0; attempt < 5; attempt++ {
		var candidate T
		err = db.
			Where("status IN ? AND next_attempt_at <= ?", dueStatuses, now).
			Order("next_attempt_at ASC").
			Order(keyColumn + " ASC").
			Take(&candidate).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return row, false, nil
		}
		if err != nil {
			return row, false, err
		}

		claimed := db.Model(new(T)).
			Where(keyColumn+" = ? AND status IN ? AND next_attempt_at <= ?", keyOf(&candidate), dueStatuses, now).
			Updates(map[string]any{
				"status":          running,
				"next_attempt_at": now.Add(claimLease),
			})
		if claimed.Error != nil {
			return row, false, claimed.Error
		}
		if claimed.RowsAffected == 1 {
			return candidate, true, nil
		}
	}

	return row, false, nil
}
