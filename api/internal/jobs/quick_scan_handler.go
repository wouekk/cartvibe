package jobs

import (
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

type QuickScanTaskPayload struct {
	Token            *structs.Claims
	PaidByUserId     uint
	GroupId          uint
	Status           models.ReceiptStatus
	CategoryIds      []uint
	TagIds           []uint
	Note             string
	// Comment is what Note was called while a receipt had comments. A scan queued before the update still
	// carries it; nothing writes it any more.
	Comment          string
	TempPath         string
	OriginalFileName string
}

// noteText is the scan's note, under whichever name the job was queued with.
func (payload QuickScanTaskPayload) noteText() string {
	if payload.Note != "" {
		return payload.Note
	}
	return payload.Comment
}

const (
	quickScanReadyTitle  = "Receipt ready"
	quickScanFailedTitle = "Receipt scan failed"
)

// errQuickScanNotAllowed: the uploader lost Quick Scan in the group between the upload and the scan.
var errQuickScanNotAllowed = errors.New("the uploader may no longer quick scan in this group")

// HandleQuickScanTask reads one uploaded photo into a receipt. The queue's single worker runs the scans one at a
// time: five photos uploaded together are read one by one instead of five AI calls at once (which is also what
// the AI provider's rate limit prefers).
func HandleQuickScanTask(ctx context.Context, job models.Job) error {
	var payload QuickScanTaskPayload

	err := json.Unmarshal([]byte(job.Payload), &payload)
	if err != nil {
		return HandleError(fmt.Errorf("quick scan job with an unreadable payload: %v: %w", err, ErrNoRetry))
	}
	if payload.Token == nil {
		return HandleError(fmt.Errorf("quick scan job without an uploader: %w", ErrNoRetry))
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}

	// Authorization is read from the database when the scan runs, never from the claims in the payload: a member
	// removed (or whose role lost Quick Scan) since the upload gets no receipt. Retrying would not change that.
	allowed, err := services.NewPermissionService(nil).HasGroupPermissions(payload.Token.UserId, payload.GroupId, permissions.GroupReceiptsQuickScan)
	if err != nil {
		return HandleError(err)
	}
	if !allowed {
		return HandleError(fmt.Errorf("%w: %w", errQuickScanNotAllowed, ErrNoRetry))
	}

	receiptService := services.NewReceiptService(nil)
	receipt, aiErr, err := receiptService.QuickScanKeepingThePhoto(services.QuickScanParams{
		Token:            payload.Token,
		PaidByUserId:     payload.PaidByUserId,
		GroupId:          payload.GroupId,
		Status:           payload.Status,
		CategoryIds:      payload.CategoryIds,
		TagIds:           payload.TagIds,
		Note:             payload.noteText(),
		TempPath:         payload.TempPath,
		OriginalFileName: payload.OriginalFileName,
		JobId:            repositories.JobIdString(job.ID),
	})
	if err != nil {
		if IsFinalAttempt(ctx) {
			notifyQuickScanResult(payload, quickScanFailedTitle, 0, "")
		}
		return HandleError(err)
	}

	// The AI could not read it (none configured, out of credits, down, an unreadable answer): the receipt is saved
	// with the photo to fill in by hand, and the scan is finished, since asking again would cost another AI call
	// that a missing key or credit would refuse too.
	if aiErr != nil {
		notifyQuickScanResult(payload, quickScanFailedTitle, receipt.ID, "")
		return nil
	}

	notifyQuickScanResult(payload, quickScanReadyTitle, receipt.ID, receipt.Name)
	return nil
}

// notifyQuickScanResult tells the person who uploaded the photo how it went: read (a receipt and its name), saved
// without the AI (a receipt, no name), or failed (no receipt). Best-effort: a notification must never turn a
// finished scan into a failed task, so errors are only logged.
func notifyQuickScanResult(payload QuickScanTaskPayload, title string, receiptId uint, receiptName string) {
	if payload.Token == nil {
		return
	}

	body := fmt.Sprintf("The AI could not read %s. Check the activity and add the receipt by hand.", payload.OriginalFileName)
	switch {
	case receiptId != 0 && receiptName != "":
		body = fmt.Sprintf("The receipt: %s has been read by the AI. Check it out! %s",
			receiptName,
			repositories.BuildParamaterisedString("receiptId", receiptId, "", "link"))
	case receiptId != 0:
		body = fmt.Sprintf("The AI could not read the photo: %s. It is saved as a receipt for you to fill in. %s",
			payload.OriginalFileName,
			repositories.BuildParamaterisedString("receiptId", receiptId, "", "link"))
	}

	err := repositories.NewNotificationRepository(nil).SendNotificationToUsers(
		[]uint{payload.Token.UserId},
		title,
		body,
		models.NOTIFICATION_TYPE_NORMAL,
		[]interface{}{},
	)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "could not send the quick scan notification:", err.Error())
	}
}
