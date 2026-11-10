package jobs

import "cartvibe/api/internal/logging"

// HandleError logs a failure and hands it back, for the handlers that return it.
func HandleError(err error) error {
	logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
	return err
}
