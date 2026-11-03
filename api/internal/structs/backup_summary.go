package structs

type BackupEntityCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type BackupSummary struct {
	Counts        []BackupEntityCount `json:"counts"`
	FileCount     int                 `json:"fileCount"`
	FileBytes     int64               `json:"fileBytes"`
	FormatVersion int                 `json:"formatVersion"`
}
