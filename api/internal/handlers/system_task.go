package handlers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"cartvibe/api/internal/jobs"
	"errors"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
	"mime"
	"net/http"
	"os"
	"path/filepath"
)

func GetSystemTasks(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting system tasks",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppSystemTasksRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			command := commands.GetSystemTaskCommand{}
			err := command.LoadDataFromRequest(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			vErr := command.Validate()
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			systemTaskRepository := repositories.NewSystemTaskRepository(nil)
			systemTasks, count, err := systemTaskRepository.GetPagedSystemTasks(command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// Both hydration passes below run before the copy loop, which takes
			// each task by value — a mutation after it would be thrown away.

			// Older "Updated Receipt" rows stored an incomplete "before"; the
			// response compares them against an earlier complete copy instead.
			err = services.NewSystemTaskService(nil).UpcastReceiptUpdateDescriptions(systemTasks)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// This table is app-scoped, so it lists groups the caller may not be a
			// member of; the flag is resolved per caller so it never advertises a
			// file the source-file endpoints would refuse to serve them.
			token := structs.GetClaims(r)
			err = jobs.SetSystemTaskHasSourceFile(systemTasks, groupSourceFileReader(token.UserId))
			if err != nil {
				return http.StatusInternalServerError, err
			}

			pagedData := structs.PagedData{}
			data := make([]any, 0)

			for i := 0; i < len(systemTasks); i++ {
				data = append(data, systemTasks[i])
			}

			pagedData.Data = data
			pagedData.TotalCount = count

			responseBytes, err := utils.MarshalResponseData(pagedData)
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

func GetActivitiesForGroups(w http.ResponseWriter, r *http.Request) {
	errorMsg := "Error getting group activities"
	command := commands.PagedActivityRequestCommand{}
	err := command.LoadDataFromRequest(w, r)
	if err != nil {
		utils.WriteCustomErrorResponse(w, errorMsg, http.StatusInternalServerError)
		return
	}

	stringGroupIds := make([]string, 0)
	for _, groupId := range command.GroupIds {
		stringGroupIds = append(stringGroupIds, utils.UintToString(groupId))
	}

	handler := structs.Handler{
		ErrorMessage:     errorMsg,
		Writer:           w,
		Request:          r,
		GroupIds:         stringGroupIds,
		GroupPermissions: []string{permissions.GroupActivitiesRead},
		ResponseType:     constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {

			vErr := command.Validate()
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			systemTaskRepository := repositories.NewSystemTaskRepository(nil)

			activities, count, err := systemTaskRepository.GetPagedActivities(command)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			err = jobs.SetActivityFlags(&activities)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			pagedData := structs.PagedData{}
			data := make([]any, 0)

			for i := 0; i < len(activities); i++ {
				data = append(data, activities[i])
			}

			pagedData.Data = data
			pagedData.TotalCount = count

			responseBytes, err := utils.MarshalResponseData(pagedData)
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

func RerunActivity(w http.ResponseWriter, r *http.Request) {
	errorMsg := "Error rerunning activity"

	// The group and the actor come off the task ROW, and everything the job knows is
	// read in the handler function below, behind the permission gate.
	systemTask, groupId, handled := loadSystemTaskForSourceFile(w, r, errorMsg)
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
			// The task type is checked here rather than before the handler is built,
			// so it stays behind the gate: a caller who may not reach this activity
			// must not learn from a 400 that it is of a rerunnable type.
			if systemTask.Type != models.QUICK_SCAN {
				logging.LogStd(logging.LOG_LEVEL_ERROR, "Only quick scan activities can be rerun")
				utils.WriteCustomErrorResponse(w, "Only a quick scan activity can be rerun.", http.StatusBadRequest)
				return 0, nil
			}

			job, found, err := jobs.FindJobForSystemTask(systemTask)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// Only a job that failed for good may be run again: one that waits or runs would process the same
			// upload twice, and one that succeeded (or was swept) has no row left. See CanRerunJob.
			if !found || !jobs.CanRerunJob(job) {
				utils.WriteCustomErrorResponse(w, "Only a failed activity can be rerun.", http.StatusBadRequest)
				return 0, nil
			}

			// Defence in depth: the client hides the control once the source file
			// is gone, but the endpoint stays callable. A rerun reads its upload
			// first, so without this it would fail deep in the pipeline instead of
			// saying what is wrong.
			if !jobs.RerunSourceFilePresent(job) {
				utils.WriteCustomErrorResponse(w, "The file this activity needs is no longer available.", http.StatusBadRequest)
				return 0, nil
			}

			// The claim is one conditional UPDATE: of two people pressing the button at once, one starts the scan.
			rerun, err := jobs.RerunJob(job)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if !rerun {
				utils.WriteCustomErrorResponse(w, "Only a failed activity can be rerun.", http.StatusBadRequest)
				return 0, nil
			}

			return 0, nil
		},
	}

	HandleRequest(handler)
}

// groupSourceFileReader answers "may this user reach source files in that group",
// memoized per group for the life of one request. It is the same gate the
// source-file endpoints apply, so a flag can never promise a button that 403s.
func groupSourceFileReader(userId uint) func(groupId uint) bool {
	return groupPermissionChecker(userId, permissions.GroupActivitiesRead)
}

// GetSystemTaskSourceFile returns the upload behind a failed activity, converted
// for display.
func GetSystemTaskSourceFile(w http.ResponseWriter, r *http.Request) {
	errorMsg := "Error getting activity source file"

	systemTask, groupId, handled := loadSystemTaskForSourceFile(w, r, errorMsg)
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
			sourceFile, ok := resolveSourceFile(w, systemTask, errorMsg)
			if !ok {
				return 0, nil
			}

			fileRepository := repositories.NewFileRepository(nil)

			// Prefer the already-converted OCR copy. Converting the original
			// instead can mean rasterizing a multi-page PDF at the configured DPI
			// inside this request.
			pathToRead := sourceFile.PreviewPath
			if len(pathToRead) == 0 || !utils.FileExists(pathToRead) {
				pathToRead = sourceFile.Path
			}

			// os.ReadFile, never utils.ReadFile: that one returns (nil, nil) on a
			// read error, which would serve an empty image as a success.
			fileBytes, err := os.ReadFile(pathToRead)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// BuildDisplayImageString, never BuildEncodedImageString: a quick scan's
			// upload is whatever the user picked, and the uploader accepts PDF and
			// HEIC. Encoding those unconverted yields a data URI the browser cannot
			// render — silently, since GetFileType labels a PDF image/jpeg anyway.
			encodedImage, err := fileRepository.BuildDisplayImageString(fileBytes)
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

// DownloadSystemTaskSourceFile serves the upload behind a failed activity
// verbatim, so the user can file the receipt by hand.
func DownloadSystemTaskSourceFile(w http.ResponseWriter, r *http.Request) {
	errorMsg := "Error downloading activity source file"

	systemTask, groupId, handled := loadSystemTaskForSourceFile(w, r, errorMsg)
	if handled {
		return
	}

	handler := structs.Handler{
		ErrorMessage:     errorMsg,
		Writer:           w,
		Request:          r,
		GroupId:          groupId,
		GroupPermissions: []string{permissions.GroupActivitiesRead},
		// Deliberately unset so http.ServeFile derives the Content-Type itself.
		ResponseType: "",
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			sourceFile, ok := resolveSourceFile(w, systemTask, errorMsg)
			if !ok {
				return 0, nil
			}

			// Sanitized because an email attachment's name comes from a MIME header,
			// then formatted by mime.FormatMediaType rather than concatenated: a name
			// containing a quote would otherwise close the quoted value early and
			// truncate what the client reads back off the header.
			fileName := utils.SanitizeFileName(sourceFile.FileName)
			if len(fileName) == 0 {
				fileName = filepath.Base(sourceFile.Path)
			}

			w.Header().Set(
				"Content-Disposition",
				mime.FormatMediaType("attachment", map[string]string{"filename": fileName}),
			)
			http.ServeFile(w, r, sourceFile.Path)

			// Streaming has begun, so returning an error here would write an error
			// body over the file.
			return 0, nil
		},
	}

	HandleRequest(handler)
}

// activityAccessDeniedMessage is deliberately the same for "no such activity" and "you
// are not in this group", so neither answer distinguishes the other.
//
// It is HandleRequest's own denial body rather than wording of its own, because the
// group gate writes that one and these helpers cannot: a caller comparing a denial
// from here against one from the gate would otherwise learn which check refused, and
// so whether the task exists at all.
const activityAccessDeniedMessage = unauthorizedEntityMessage

// loadSystemTaskForSourceFile loads the system task named in the URL and returns the group
// the request must be gated on. It reports true when it has already written a response, in
// which case the caller must return without building a handler.
//
// It reads the group off the system_tasks ROW rather than the job's payload. That is what
// lets every authorization answer come before any file-specific one: resolving the payload
// means a second lookup that can itself fail or report the file gone, and doing that
// first told an unauthorized caller whether a task existed and still had its upload. The
// row carries GroupId for both task types (CreateSystemTasksFromMetadata is passed one by
// the quick scan and email paths alike), and it saves the GroupSettings lookup
// ResolveActivityGroupId needs for email.
//
// A nil GroupId fails closed: there is no group to gate against, so nothing is served.
func loadSystemTaskForSourceFile(
	w http.ResponseWriter,
	r *http.Request,
	errorMsg string,
) (models.SystemTask, string, bool) {
	systemTaskRepository := repositories.NewSystemTaskRepository(nil)

	systemTaskId, err := utils.StringToUint(chi.URLParam(r, "id"))
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
		utils.WriteCustomErrorResponse(w, errorMsg, http.StatusBadRequest)
		return models.SystemTask{}, "", true
	}

	systemTask, err := systemTaskRepository.GetSystemTaskById(systemTaskId)
	if err != nil {
		// A task that does not exist has to answer exactly like one the caller may
		// not reach, or the status code is an existence oracle for arbitrary task
		// ids — the very thing the group gate below closes. Only a missing row maps
		// to the denial; any other failure is still a 500.
		if errors.Is(err, gorm.ErrRecordNotFound) {
			utils.WriteCustomErrorResponse(w, activityAccessDeniedMessage, http.StatusForbidden)
			return models.SystemTask{}, "", true
		}

		logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
		utils.WriteCustomErrorResponse(w, errorMsg, http.StatusInternalServerError)
		return models.SystemTask{}, "", true
	}

	if systemTask.GroupId == nil {
		utils.WriteCustomErrorResponse(w, activityAccessDeniedMessage, http.StatusForbidden)
		return models.SystemTask{}, "", true
	}

	return systemTask, utils.UintToString(*systemTask.GroupId), false
}

// resolveSourceFile locates the upload behind an activity. It reports false when it has
// already written a response.
//
// It runs INSIDE the handler function, so the group permission has already been checked.
func resolveSourceFile(
	w http.ResponseWriter,
	systemTask models.SystemTask,
	errorMsg string,
) (jobs.SystemTaskSourceFile, bool) {
	sourceFile, err := jobs.ResolveSystemTaskSourceFile(systemTask)
	if err != nil {
		if errors.Is(err, jobs.ErrSourceFileUnsupportedTask) {
			utils.WriteCustomErrorResponse(w, "This activity type has no source file.", http.StatusBadRequest)
			return jobs.SystemTaskSourceFile{}, false
		}

		if errors.Is(err, jobs.ErrSourceFileUnavailable) {
			utils.WriteCustomErrorResponse(w, "The source file is no longer available.", http.StatusNotFound)
			return jobs.SystemTaskSourceFile{}, false
		}

		logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
		utils.WriteCustomErrorResponse(w, errorMsg, http.StatusInternalServerError)
		return jobs.SystemTaskSourceFile{}, false
	}

	return sourceFile, true
}
