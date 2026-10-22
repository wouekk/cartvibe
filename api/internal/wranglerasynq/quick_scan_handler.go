package wranglerasynq

import (
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"context"
	"encoding/json"
	"fmt"
	"github.com/hibiken/asynq"
	"sync"
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

// quickScanMutex lets the scans run one at a time: five photos uploaded together are read one by one, in the order
// they were queued, instead of five AI calls at once (which is also what the AI provider's rate limit prefers).
var quickScanMutex sync.Mutex

const (
	quickScanReadyTitle  = "Receipt ready"
	quickScanFailedTitle = "Receipt scan failed"
)

func HandleQuickScanTask(context context.Context, task *asynq.Task) error {
	taskId, err := GetTaskIdFromContext(context)
	if err != nil {
		return HandleError(err)
	}

	var payload QuickScanTaskPayload

	err = json.Unmarshal(task.Payload(), &payload)
	if err != nil {
		return HandleError(err)
	}

	quickScanMutex.Lock()
	defer quickScanMutex.Unlock()

	receiptService := services.NewReceiptService(nil)
	receipt, err := receiptService.QuickScan(services.QuickScanParams{
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
		if isFinalAttempt(context) {
			notifyQuickScanResult(payload, quickScanFailedTitle, 0, "")
		}
		return HandleError(err)
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

// notifyQuickScanResult tells the person who uploaded the photo how it went. Best-effort: a notification must never
// turn a finished scan into a failed task, so errors are only logged.
func notifyQuickScanResult(payload QuickScanTaskPayload, title string, receiptId uint, receiptName string) {
	if payload.Token == nil {
		return
	}

	body := fmt.Sprintf("The AI could not read %s. Check the activity and add the receipt by hand.", payload.OriginalFileName)
	if receiptId != 0 {
		body = fmt.Sprintf("The receipt: %s has been read by the AI. Check it out! %s",
			receiptName,
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
