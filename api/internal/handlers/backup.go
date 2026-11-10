package handlers

import (
	"cartvibe/api/internal/backup"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"errors"
	"mime"
	"net/http"
	"strconv"
	"time"
)

var errBadIncludeFiles = errors.New("includeFiles must be true or false")

// GetBackupSummary answers what an export would hold, so the Export & import tab can show the size
// of the download before it starts.
func GetBackupSummary(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error reading the household summary",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppBackupExport},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			snapshot, err := backup.TakeSnapshot(repositories.GetDB(), backupOptions(true))
			if err != nil {
				return http.StatusInternalServerError, err
			}

			summary := structs.BackupSummary{Counts: []structs.BackupEntityCount{}, FormatVersion: backup.FormatVersion}
			for _, count := range snapshot.Counts() {
				summary.Counts = append(summary.Counts, structs.BackupEntityCount{Name: count.Name, Count: count.Count})
			}
			summary.FileCount, summary.FileBytes = snapshot.FileTotals()

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

// ExportBackup streams the whole household as a ZIP. The rows are read in one short transaction
// first, so a failure there still answers a JSON error; once the ZIP is streaming, errors can only
// be logged (the download then ends early and its manifest is missing).
func ExportBackup(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error exporting the household",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppBackupExport},
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			includeFiles := false
			if raw := r.URL.Query().Get("includeFiles"); raw != "" {
				parsed, err := strconv.ParseBool(raw)
				if err != nil {
					return http.StatusBadRequest, errBadIncludeFiles
				}
				includeFiles = parsed
			}

			options := backupOptions(includeFiles)
			snapshot, err := backup.TakeSnapshot(repositories.GetDB(), options)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			// The server's WriteTimeout (main.go) would cut a large download off at five minutes.
			controller := http.NewResponseController(w)
			if err := controller.SetWriteDeadline(time.Time{}); err != nil && !errors.Is(err, http.ErrNotSupported) {
				return http.StatusInternalServerError, err
			}

			fileName := "cartvibe-backup-" + options.Now.In(repositories.GetAppLocation()).Format(time.DateOnly) + ".zip"
			w.Header().Set("Content-Type", constants.ApplicationZip)
			w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": fileName}))
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusOK)

			if err := snapshot.WriteZip(w); err != nil {
				logging.LogStd(logging.LOG_LEVEL_ERROR, "household export: "+err.Error())
			}
			return 0, nil
		},
	}

	HandleRequest(handler)
}

func backupOptions(includeFiles bool) backup.Options {
	about, _ := repositories.NewAboutRepository(nil).GetAboutData()
	return backup.Options{IncludeFiles: includeFiles, AppVersion: about.Version, Now: time.Now()}
}
