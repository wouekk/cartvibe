package models

import (
	"cartvibe/api/internal/utils"

	"gorm.io/gorm"
)

type Group struct {
	BaseModel
	Name                 string               `gorm:"not null" json:"name"`
	IsDefaultGroup       bool                 `json:"isDefault"`
	GroupMembers         []GroupMember        `json:"groupMembers"`
	GroupReceiptSettings GroupReceiptSettings `json:"groupReceiptSettings"`
	Status               GroupStatus          `gorm:"default:'ACTIVE'; not null" json:"status"`
	IsAllGroup           bool                 `json:"isAllGroup" gorm:"default:false"`

	// IsolateMembers turns on member-presence isolation for this group: members
	// cannot discover that other members exist (through the user directory, group
	// roster, receipts, comments, activities, or notifications) unless
	// they hold a group role flagged SeesAllMembers, or the app-level app.users.read.
	// Default false ⇒ existing groups behave exactly as before (no migration).
	IsolateMembers bool `json:"isolateMembers" gorm:"not null;default:false"`

	// IsHousehold marks the install's one shared household (Phase 3 M5): later accounts join it. It is a flag, not
	// the name "Household", so the household can be renamed. Old installs get it from the data migration
	// mark-household-group-v1; a lookup that finds no flagged group falls back to the name.
	IsHousehold bool `json:"-" gorm:"not null;default:false"`

	// Icon and Color are the household's look in the app: one of GroupIcons and GroupColors, or "" for the initial on
	// the default colour. Plain strings on the contract.
	Icon  string `json:"icon" gorm:"not null;default:''"`
	Color string `json:"color" gorm:"not null;default:''"`
}

// A rename moves the group's data folder; that happens in GroupRepository.UpdateGroup, inside the transaction, so a
// failed move rolls the new name back instead of leaving receipt files under a folder nothing points at.

func (deletedGroup *Group) AfterDelete(tx *gorm.DB) (err error) {
	if deletedGroup.ID > 0 {
		dataPath, err := utils.BuildGroupPathString(utils.UintToString(deletedGroup.ID), deletedGroup.Name)
		if err != nil {
			return err
		}

		err = utils.RemoveAllInDataDir(dataPath)
		if err != nil {
			return err
		}
	}

	return nil
}
