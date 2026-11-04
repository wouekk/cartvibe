package repositories

import (
	"cartvibe/api/internal/utils"
	"fmt"
	"strings"
)

// groupFolderMove renames a group's data folder (data/<id>-<name>/) when the group is renamed. Receipt files are
// found through the group's current name (FileRepository.BuildFilePath), so the folder must follow the name.
type groupFolderMove struct {
	from  string
	to    string
	moved bool
}

// planGroupFolderMove builds the move for a rename; it is a no-op when the name does not change.
func planGroupFolderMove(groupId uint, oldName string, newName string) (*groupFolderMove, error) {
	if oldName == newName {
		return &groupFolderMove{}, nil
	}

	id := utils.UintToString(groupId)
	from, err := utils.BuildGroupPathString(id, oldName)
	if err != nil {
		return nil, err
	}
	to, err := utils.BuildGroupPathString(id, newName)
	if err != nil {
		return nil, err
	}

	return &groupFolderMove{from: from, to: to}, nil
}

// apply moves the folder. A group without a folder yet (no receipt files) has nothing to move. A folder already
// at the new path is refused rather than overwritten: the rename fails and nothing changes.
func (move *groupFolderMove) apply() error {
	if move.from == "" {
		return nil
	}

	exists, err := utils.DataPathExists(move.from)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}

	// A change of letter case only is the same folder on a case-insensitive disk.
	if !strings.EqualFold(move.from, move.to) {
		taken, err := utils.DataPathExists(move.to)
		if err != nil {
			return err
		}
		if taken {
			return fmt.Errorf("cannot rename the group: a data folder for the new name already exists")
		}
	}

	if err := utils.RenameDataPath(move.from, move.to); err != nil {
		return err
	}
	move.moved = true
	return nil
}

// undo moves the folder back after the database update failed to commit.
func (move *groupFolderMove) undo() {
	if !move.moved {
		return
	}
	if err := utils.RenameDataPath(move.to, move.from); err == nil {
		move.moved = false
	}
}
