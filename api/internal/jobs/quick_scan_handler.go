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
	"github.com/hibiken/asynq"
)

type QuickScanTaskPayload struct {
	Token            *structs.Claims
	PaidByUserId     uint
	GroupId          uint
	Status           models.ReceiptStatus
	CategoryIds      []uint
	TagIds           []uint
	Comment          string
	TempPath         string
	OriginalFileName string
}

// quickScanSlot lets the scans run one at a time: five photos uploaded together are read one by one instead of five
// AI calls at once (which is also what the AI provider's rate limit prefers). A scan waiting for the slot gives up
// when its task is cancelled (shutdown, timeout) instead of waiting forever.
var quickScanSlot = make(chan struct{}, 1)

// acquireQuickScanSlot waits for the slot or for ctx to end; release is called once the scan is done.
func acquireQuickScanSlot(ctx context.Context) (release func(), err error) {
	select {
	case quickScanSlot <- struct{}{}:
		return func() { <-quickScanSlot }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

const (
	quickScanReadyTitle  = "Receipt ready"
	quickScanFailedTitle = "Receipt scan failed"
)

// errQuickScanNotAllowed: the uploader lost Quick Scan in the group between the upload and the scan.
var errQuickScanNotAllowed = errors.New("the uploader may no longer quick scan in this group")

func HandleQuickScanTask(ctx context.Context, task *asynq.Task) error {
	taskId, err := GetTaskIdFromContext(ctx)
	if err != nil {
		return HandleError(err)
	}

	var payload QuickScanTaskPayload

	err = json.Unmarshal(task.Payload(), &payload)
	if err != nil {
		return HandleError(err)
	}
	if payload.Token == nil {
		return HandleError(fmt.Errorf("quick scan task without an uploader: %w", asynq.SkipRetry))
	}

	release, err := acquireQuickScanSlot(ctx)
	if err != nil {
		return HandleError(err)
	}
	defer release()

	// Authorization is read from the database when the scan runs, never from the claims in the payload: a member
	// removed (or whose role lost Quick Scan) since the upload gets no receipt. Retrying would not change that.
	allowed, err := services.NewPermissionService(nil).HasGroupPermissions(payload.Token.UserId, payload.GroupId, permissions.GroupReceiptsQuickScan)
	if err != nil {
		return HandleError(err)
	}
	if !allowed {
		return HandleError(fmt.Errorf("%w: %w", errQuickScanNotAllowed, asynq.SkipRetry))
	}

	receiptService := services.NewReceiptService(nil)
	receipt, aiErr, err := receiptService.QuickScanKeepingThePhoto(services.QuickScanParams{
		Token:            payload.Token,
		PaidByUserId:     payload.PaidByUserId,
		GroupId:          payload.GroupId,
		Status:           payload.Status,
		CategoryIds:      payload.CategoryIds,
		TagIds:           payload.TagIds,
		Comment:          payload.Comment,
		TempPath:         payload.TempPath,
		OriginalFileName: payload.OriginalFileName,
		AsynqTaskId:      taskId,
	})
	if err != nil {
		if isFinalAttempt(ctx) {
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

// isFinalAttempt is true on the last try asynq will make, so a scan that is about to be retried does not tell the
// user it failed.
func isFinalAttempt(context context.Context) bool {
	retried, retriedOk := asynq.GetRetryCount(context)
	maxRetry, maxRetryOk := asynq.GetMaxRetry(context)

	return !retriedOk || !maxRetryOk || retried >= maxRetry
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
