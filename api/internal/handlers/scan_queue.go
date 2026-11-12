package handlers

import (
	"net/http"
	"os"

	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/jobs"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"

	"github.com/go-chi/chi/v5"
)

// unreadReceiptLimit is how many unread receipts the scan queue lists; the count beside them says how many more
// there are.
const unreadReceiptLimit = 50

// groupPermissionChecker answers "does this user hold that permission in that household", remembered per household
// for the life of one request. It is the gate the endpoints behind a flag apply, so a flag never promises a button
// that answers 403.
func groupPermissionChecker(userId uint, permission string) func(groupId uint) bool {
	permissionService := services.NewPermissionService(nil)
	cache := make(map[uint]bool)

	return func(groupId uint) bool {
		if allowed, ok := cache[groupId]; ok {
			return allowed
		}

		allowed, err := permissionService.HasGroupPermissions(userId, groupId, permission)
		if err != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
			allowed = false
		}

		cache[groupId] = allowed

		return allowed
	}
}

// GetScanQueue lists what the AI has not read yet: the quick scans the queue holds and the receipts saved
// without a read. It is the AI page's, so it asks for that page's permission; the per-row flags are resolved for
// the caller.
func GetScanQueue(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting the scan queue",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppReceiptProcessingSettingsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			userId := structs.GetClaims(r).UserId
			mayReadFile := groupPermissionChecker(userId, permissions.GroupActivitiesRead)
			mayRerun := groupPermissionChecker(userId, permissions.GroupActivitiesRerun)
			mayReadAgain := groupPermissionChecker(userId, permissions.GroupReceiptsUpdate)

			queued, err := jobs.ListQueuedScans()
			if err != nil {
				return http.StatusInternalServerError, err
			}

			queue := structs.ScanQueue{Scans: make([]structs.ScanQueueScan, 0, len(queued))}
			for _, scan := range queued {
				view := structs.ScanQueueScan{
					Id:               scan.Job.ID,
					Status:           jobs.ScanStatus(scan.Job),
					FileName:         scan.FileName,
					GroupId:          scan.GroupId,
					UploadedByUserId: scan.UploadedByUserId,
					UploadedAt:       scan.Job.CreatedAt,
					Attempts:         scan.Job.Attempts,
					MaxAttempts:      scan.Job.MaxAttempts,
					LastError:        scan.Job.LastError,
					HasFile:          scan.FileUsable && mayReadFile(scan.GroupId),
					CanRerun:         jobs.CanRerunScan(scan) && mayRerun(scan.GroupId),
				}
				if view.Status == structs.ScanRetrying {
					nextAttemptAt := scan.Job.NextAttemptAt
					view.NextAttemptAt = &nextAttemptAt
				}
				queue.Scans = append(queue.Scans, view)
			}

			queue.UnreadReceipts, queue.UnreadReceiptCount, err =
				repositories.NewReceiptProductRepository(nil).ListUnreadReceipts(unreadReceiptLimit)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			for i := range queue.UnreadReceipts {
				queue.UnreadReceipts[i].CanReadAgain = mayReadAgain(queue.UnreadReceipts[i].GroupId)
			}

			responseBytes, err := utils.MarshalResponseData(queue)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

// GetScanQueueSummary counts the quick scans of the households the caller reads receipts in, for the line the
// receipts page shows everyone. It asks for sign-in only: the count is filtered, not refused.
func GetScanQueueSummary(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage: "Error getting the scan queue summary",
		Writer:       w,
		Request:      r,
		ResponseType: constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			mayRead := groupPermissionChecker(structs.GetClaims(r).UserId, permissions.GroupReceiptsRead)

			queued, err := jobs.ListQueuedScans()
			if err != nil {
				return http.StatusInternalServerError, err
			}

			summary := structs.ScanQueueSummary{}
			for _, scan := range queued {
				if !mayRead(scan.GroupId) {
					continue
				}
				if jobs.ScanStatus(scan.Job) == structs.ScanFailed {
					summary.Failed++
				} else {
					summary.Waiting++
				}
			}

			responseBytes, err := utils.MarshalResponseData(summary)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}

// loadQueuedScan loads the queued scan named in the URL and the household the request must be gated on. It
// reports true when it has already written a response. A scan that does not exist answers exactly like one the
// caller may not reach (see activityAccessDeniedMessage), so the status code never says whether an id is queued.
func loadQueuedScan(w http.ResponseWriter, r *http.Request, errorMsg string) (jobs.QueuedScan, string, bool) {
	id, err := utils.StringToUint(chi.URLParam(r, "id"))
	if err != nil {
		utils.WriteCustomErrorResponse(w, activityAccessDeniedMessage, http.StatusForbidden)
		return jobs.QueuedScan{}, "", true
	}

	scan, found, err := jobs.FindQueuedScan(id)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
		utils.WriteCustomErrorResponse(w, errorMsg, http.StatusInternalServerError)
		return jobs.QueuedScan{}, "", true
	}
	if !found {
		utils.WriteCustomErrorResponse(w, activityAccessDeniedMessage, http.StatusForbidden)
		return jobs.QueuedScan{}, "", true
	}

	return scan, utils.UintToString(scan.GroupId), false
}

// RerunQueuedScan queues a failed scan again with a fresh set of tries.
func RerunQueuedScan(w http.ResponseWriter, r *http.Request) {
	errorMsg := "Error running the scan again"

	scan, groupId, handled := loadQueuedScan(w, r, errorMsg)
	if handled {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     errorMsg,
		Writer:           w,
		Request:          r,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupActivitiesRerun},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			// Only a scan that failed for good may be run again: one that waits or is being read would be read
			// twice. See CanRerunJob.
			if !jobs.CanRerunJob(scan.Job) {
				utils.WriteCustomErrorResponse(w, "Only a failed scan can be run again.", http.StatusBadRequest)
				return 0, nil
			}
			if !jobs.RerunSourceFilePresent(scan.Job) {
				utils.WriteCustomErrorResponse(w, "The photo of this scan is no longer available.", http.StatusBadRequest)
				return 0, nil
			}

			// One conditional UPDATE: of two people pressing the button at once, one starts the scan.
			rerun, err := jobs.RerunJob(scan.Job)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if !rerun {
				utils.WriteCustomErrorResponse(w, "Only a failed scan can be run again.", http.StatusBadRequest)
				return 0, nil
			}

			return 0, nil
		},
	}

	HandleRequest(handler)
}

// GetQueuedScanFile returns the photo of a queued scan, converted for display, so a person can see which receipt
// is waiting or enter a failed one by hand.
func GetQueuedScanFile(w http.ResponseWriter, r *http.Request) {
	errorMsg := "Error getting the photo of the scan"

	scan, groupId, handled := loadQueuedScan(w, r, errorMsg)
	if handled {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     errorMsg,
		Writer:           w,
		Request:          r,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupActivitiesRead},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			sourceFile, err := jobs.ResolveQueuedScanSourceFile(scan)
			if err != nil {
				utils.WriteCustomErrorResponse(w, "The photo of this scan is no longer available.", http.StatusNotFound)
				return 0, nil
			}

			// os.ReadFile, never utils.ReadFile, which answers (nil, nil) on a read error; and
			// BuildDisplayImageString, since an upload may be a PDF or a HEIC (see GetSystemTaskSourceFile).
			fileBytes, err := os.ReadFile(sourceFile.Path)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			encodedImage, err := repositories.NewFileRepository(nil).BuildDisplayImageString(fileBytes)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			responseBytes, err := utils.MarshalResponseData(structs.SystemTaskSourceFileView{
				Name:         sourceFile.FileName,
				EncodedImage: encodedImage,
			})
			if err != nil {
				return http.StatusInternalServerError, err
			}

			w.WriteHeader(http.StatusOK)
			w.Write(responseBytes)

			return 0, nil
		},
	}

	HandleRequest(handler)
}
