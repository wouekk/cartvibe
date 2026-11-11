package repositories

import (
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/utils"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"gorm.io/gorm"
)

const idFilePathsMigration = "id-file-paths-v1"

// A household's folder as it was named until 2026-11: "<groupId>-<groupName>".
var namedGroupFolder = regexp.MustCompile(`^(\d+)-`)

// idFilePathRow is a receipt file and the household its receipt is in.
type idFilePathRow struct {
	ID        uint
	ReceiptId uint
	Name      string
	GroupId   uint
}

// runIdFilePathsMigration moves every receipt file from where it was kept until 2026-11,
// data/<groupId>-<groupName>/<receiptId>-<fileId>-<uploaded name>, to data/<groupId>/<fileId>. A household's
// name and an upload's name were parts of the old path, so a rename had to move a folder inside its database
// transaction and every path had to be checked against a crafted name; an id is neither a person's to choose nor
// ever changed.
//
// What it keeps to:
//   - It only renames. No file's bytes are read or written, and nothing is deleted except a folder it emptied.
//   - It can be run again: a file already at its new place is left alone, so a start that was cut short carries
//     on from where it was.
//   - A file a row points at that is nowhere to be found is counted and said in the log, as it was already
//     missing before; it does not stop the start.
//   - A file that is there and cannot be moved does stop the start, with the file and the reason. Going on would
//     record the move as done and leave that file where nothing looks for it.
//   - A file no row points at stays where it is, in its old folder, which is then kept and said in the log.
//
// It cannot be undone by an older version, which looks for the files under the names: the way back is to move
// them back by hand, or to restore the folder from a copy made before the update.
func runIdFilePathsMigration(tx *gorm.DB) error {
	dataDir, err := utils.GetDataDir()
	if err != nil {
		return err
	}

	entries, err := os.ReadDir(dataDir)
	if errors.Is(err, os.ErrNotExist) {
		// A fresh install: nothing was ever stored.
		return nil
	}
	if err != nil {
		return fmt.Errorf("could not list %s: %w", dataDir, err)
	}

	// The old folders by household. More than one can exist for an id (a rename whose folder move failed long
	// ago), and its name on disk need not be the household's name today, so the folders are found by the id they
	// start with rather than rebuilt from the name.
	oldFolders := map[string][]string{}
	for _, entry := range entries {
		if match := namedGroupFolder.FindStringSubmatch(entry.Name()); entry.IsDir() && match != nil {
			oldFolders[match[1]] = append(oldFolders[match[1]], filepath.Join(dataDir, entry.Name()))
		}
	}
	if len(oldFolders) == 0 {
		return nil
	}

	var rows []idFilePathRow
	err = tx.Table("file_data").
		Select("file_data.id, file_data.receipt_id, file_data.name, receipts.group_id").
		Joins("INNER JOIN receipts ON receipts.id = file_data.receipt_id").
		Order("file_data.id").
		Scan(&rows).Error
	if err != nil {
		return err
	}

	moved, alreadyThere, missing := 0, 0, 0
	for _, row := range rows {
		groupId := utils.UintToString(row.GroupId)
		fileId := utils.UintToString(row.ID)

		target, err := utils.BuildReceiptFilePathString(groupId, fileId)
		if err != nil {
			return err
		}
		if exists, err := utils.DataPathExists(target); err != nil {
			return err
		} else if exists {
			alreadyThere++
			continue
		}

		source := findNamedFile(oldFolders[groupId], utils.UintToString(row.ReceiptId)+"-"+fileId+"-"+row.Name)
		if source == "" {
			missing++
			continue
		}

		if err := utils.EnsureDataDirectory(filepath.Dir(target)); err != nil {
			return fmt.Errorf("could not make the folder for household %s: %w", groupId, err)
		}
		if err := utils.RenameDataPath(source, target); err != nil {
			return fmt.Errorf("could not move the receipt file %s to %s: %w", source, target, err)
		}
		moved++
	}

	// An old folder that is empty now is removed; one that still holds something is kept as it is.
	kept := 0
	for _, folders := range oldFolders {
		for _, folder := range folders {
			if err := utils.RemoveDataPath(folder); err != nil {
				kept++
			}
		}
	}

	logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf(
		"receipt files are stored by id now (data/<household id>/<file id>): %d moved, %d already in place, %d not found on disk",
		moved, alreadyThere, missing))
	if kept > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf(
			"%d old household folder(s) under data/ still hold files no receipt points at and were left as they are", kept))
	}

	return nil
}

// findNamedFile looks for a file under its old name in a household's old folders. The name holds what a person
// uploaded the file as, so it is only ever joined to a folder and checked to stay inside the data directory.
func findNamedFile(folders []string, name string) string {
	for _, folder := range folders {
		candidate := filepath.Join(folder, name)
		if filepath.Dir(candidate) != folder {
			// A name with a separator in it would point somewhere else; no such file was ever written.
			continue
		}
		if exists, err := utils.DataPathExists(candidate); err == nil && exists {
			return candidate
		}
	}
	return ""
}
