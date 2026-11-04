package handlers

import (
	"cartvibe/api/internal/backup"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"cartvibe/api/internal/jobs"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

const (
	backupNotAnExportMessage   = "This file is not a CartVibe export."
	backupTooNewMessage        = "This export comes from a newer CartVibe. Update this server first."
	backupDamagedMessage       = "This file is damaged or incomplete. Download the export again."
	backupTooLargeMessage      = "The file is larger than 4 GB."
	backupNoFileMessage        = "Choose an export file to upload."
	backupAlreadyStarted       = "This import has already started."
	backupNotEmptyMessage      = "This server already has receipts or shopping lists. An export can only be imported into an empty household."
	backupWorkerUnreachable    = "The background worker cannot be reached. Try again in a minute."
	backupOnlyPreviewedDeleted = "Only an import that has not started can be removed."
)

// PreviewBackupImport streams an uploaded export to disk, checks it against its manifest and answers
// what an import would do. Nothing is written to the household.
func PreviewBackupImport(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error reading the export",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppBackupImport},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			// An upload of several GB outlasts the server's five-minute timeouts.
			controller := http.NewResponseController(w)
			for _, clear := range []func(time.Time) error{controller.SetReadDeadline, controller.SetWriteDeadline} {
				if err := clear(time.Time{}); err != nil && !errors.Is(err, http.ErrNotSupported) {
					return http.StatusInternalServerError, err
				}
			}

			db := repositories.GetDB()
			token := structs.GetClaims(r)
			if err := backup.RemoveStaleUploads(db, time.Now()); err != nil {
				logging.LogStd(logging.LOG_LEVEL_ERROR, "household import: stale uploads: "+err.Error())
			}

			r.Body = http.MaxBytesReader(w, r.Body, backup.MaxUploadBytes+(1<<20))
			reader, err := r.MultipartReader()
			if err != nil {
				utils.WriteCustomErrorResponse(w, backupNoFileMessage, http.StatusBadRequest)
				return 0, nil
			}

			var job models.BackupImportJob
			for {
				part, err := reader.NextPart()
				if errors.Is(err, io.EOF) {
					break
				}
				if err != nil {
					return uploadFailed(w, db, job.ID, err)
				}
				if part.FormName() != "file" {
					continue
				}

				job = models.BackupImportJob{Status: models.BackupImportPreviewed, FileName: utils.SanitizeFileName(part.FileName())}
				job.CreatedBy = &token.UserId
				if err := db.Create(&job).Error; err != nil {
					return http.StatusInternalServerError, err
				}
				size, err := backup.SaveUpload(job.ID, part)
				if err != nil {
					return uploadFailed(w, db, job.ID, err)
				}
				job.FileSize = size
				break
			}
			if job.ID == 0 {
				utils.WriteCustomErrorResponse(w, backupNoFileMessage, http.StatusBadRequest)
				return 0, nil
			}

			archive, file, err := backup.OpenUpload(job.ID)
			if err != nil {
				return uploadFailed(w, db, job.ID, err)
			}
			defer file.Close()
			household, err := backup.Parse(archive)
			if err != nil {
				return uploadFailed(w, db, job.ID, err)
			}

			preview, err := backup.BuildPreview(db, archive, household, token.UserId)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			preview.JobId = job.ID
			preview.FileName = job.FileName

			err = db.Model(&models.BackupImportJob{}).Where("id = ?", job.ID).Updates(map[string]any{
				"file_size": job.FileSize, "export_id": archive.Manifest.ExportId, "format_version": archive.Manifest.FormatVersion,
			}).Error
			if err != nil {
				return http.StatusInternalServerError, err
			}

			return writeBackupJson(w, http.StatusOK, preview)
		},
	}

	HandleRequest(handler)
}

// uploadFailed drops the job and its file and answers what was wrong with the file.
func uploadFailed(w http.ResponseWriter, db *gorm.DB, jobId uint, err error) (int, error) {
	if jobId != 0 {
		backup.RemoveUpload(jobId)
		db.Delete(&models.BackupImportJob{}, jobId)
	}

	message := backupDamagedMessage
	var tooLarge *http.MaxBytesError
	switch {
	case errors.Is(err, backup.ErrNotABackup):
		message = backupNotAnExportMessage
	case errors.Is(err, backup.ErrFormatTooNew):
		message = backupTooNewMessage
	case errors.Is(err, backup.ErrTooLarge), errors.As(err, &tooLarge):
		message = backupTooLargeMessage
	}
	logging.LogStd(logging.LOG_LEVEL_INFO, "household import upload refused: "+err.Error())
	utils.WriteCustomErrorResponse(w, message, http.StatusBadRequest)
	return 0, nil
}

func writeBackupJson(w http.ResponseWriter, status int, value any) (int, error) {
	responseBytes, err := utils.MarshalResponseData(value)
	if err != nil {
		return http.StatusInternalServerError, err
	}
	w.WriteHeader(status)
	w.Write(responseBytes)
	return 0, nil
}

// findBackupImport loads a job by the id in the URL. An unknown or malformed id answers the same 403 as
// a denial.
func findBackupImport(w http.ResponseWriter, r *http.Request) (models.BackupImportJob, bool) {
	var job models.BackupImportJob
	jobId, err := utils.StringToUint(chi.URLParam(r, "jobId"))
	if err == nil {
		err = repositories.GetDB().Where("id = ?", jobId).First(&job).Error
	}
	if err != nil {
		utils.WriteCustomErrorResponse(w, unauthorizedEntityMessage, http.StatusForbidden)
		return job, false
	}
	return job, true
}

type backupImportStartCommand struct {
	MeSourceUserId *uint `json:"meSourceUserId"`
}

// StartBackupImport queues a previewed import. The household must still be empty.
func StartBackupImport(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error starting the import",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppBackupImport},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			job, ok := findBackupImport(w, r)
			if !ok {
				return 0, nil
			}
			if job.Status != models.BackupImportPreviewed {
				utils.WriteCustomErrorResponse(w, backupAlreadyStarted, http.StatusBadRequest)
				return 0, nil
			}

			command := backupImportStartCommand{}
			body, err := utils.GetBodyData(w, r)
			if err != nil {
				return http.StatusBadRequest, err
			}
			if len(body) > 0 {
				if err := json.Unmarshal(body, &command); err != nil {
					return http.StatusBadRequest, err
				}
			}

			db := repositories.GetDB()
			empty, err := backup.HouseholdIsEmpty(db)
			if err != nil {
				return http.StatusInternalServerError, err
			}
			if !empty {
				utils.WriteCustomErrorResponse(w, backupNotEmptyMessage, http.StatusBadRequest)
				return 0, nil
			}

			claimed := db.Model(&models.BackupImportJob{}).Where("id = ? AND status = ?", job.ID, models.BackupImportPreviewed).
				Updates(map[string]any{"status": models.BackupImportQueued, "me_source_user_id": command.MeSourceUserId})
			if claimed.Error != nil {
				return http.StatusInternalServerError, claimed.Error
			}
			if claimed.RowsAffected == 0 {
				utils.WriteCustomErrorResponse(w, backupAlreadyStarted, http.StatusBadRequest)
				return 0, nil
			}

			if err := jobs.EnqueueBackupImport(job.ID); err != nil {
				logging.LogStd(logging.LOG_LEVEL_ERROR, "household import: enqueue: "+err.Error())
				db.Model(&models.BackupImportJob{}).Where("id = ?", job.ID).
					Updates(map[string]any{"status": models.BackupImportPreviewed})
				utils.WriteCustomErrorResponse(w, backupWorkerUnreachable, http.StatusInternalServerError)
				return 0, nil
			}

			db.First(&job, job.ID)
			return writeBackupJson(w, http.StatusAccepted, backup.ViewOf(job))
		},
	}

	HandleRequest(handler)
}

// GetBackupImports answers the newest five imports.
func GetBackupImports(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error reading the imports",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppBackupImport},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			var importJobs []models.BackupImportJob
			if err := repositories.GetDB().Order("id DESC").Limit(5).Find(&importJobs).Error; err != nil {
				return http.StatusInternalServerError, err
			}
			views := make([]backup.JobView, 0, len(importJobs))
			for _, job := range importJobs {
				views = append(views, backup.ViewOf(job))
			}
			return writeBackupJson(w, http.StatusOK, views)
		},
	}

	HandleRequest(handler)
}

// GetBackupImport answers one import with its progress.
func GetBackupImport(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error reading the import",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppBackupImport},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			job, ok := findBackupImport(w, r)
			if !ok {
				return 0, nil
			}
			return writeBackupJson(w, http.StatusOK, backup.ViewOf(job))
		},
	}

	HandleRequest(handler)
}

// DeleteBackupImport drops an import that was only previewed, with its file.
func DeleteBackupImport(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error removing the import",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppBackupImport},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			job, ok := findBackupImport(w, r)
			if !ok {
				return 0, nil
			}
			if job.Status != models.BackupImportPreviewed {
				utils.WriteCustomErrorResponse(w, backupOnlyPreviewedDeleted, http.StatusBadRequest)
				return 0, nil
			}
			backup.RemoveUpload(job.ID)
			if err := repositories.GetDB().Delete(&models.BackupImportJob{}, job.ID).Error; err != nil {
				return http.StatusInternalServerError, err
			}
			w.WriteHeader(http.StatusOK)
			return 0, nil
		},
	}

	HandleRequest(handler)
}
