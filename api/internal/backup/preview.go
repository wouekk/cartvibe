package backup

import (
	"strings"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"

	"gorm.io/gorm"
)

// The open strings a preview warns or blocks with.
const (
	WarningCurrencySet       = "currency_set"
	WarningTimeZoneSet       = "time_zone_set"
	WarningFilesNotIncluded  = "files_not_included"
	WarningFilesMissing      = "files_missing"
	WarningTemplateReplaced  = "template_replaced"
	WarningUnknownGroupRole  = "unknown_group_role"
	BlockerHouseholdNotEmpty = "household_not_empty"
	BlockerInvalidRows       = "invalid_rows"

	MatchAccount  = "account"
	MatchNameOnly = "name_only"
)

type PreviewPerson struct {
	SourceId    uint   `json:"sourceId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Match       string `json:"match"`
}

type PreviewCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// Preview is what an import would do, worked out without writing anything.
type Preview struct {
	JobId               uint            `json:"jobId"`
	FileName            string          `json:"fileName"`
	ExportedAt          string          `json:"exportedAt"`
	AppVersion          string          `json:"appVersion"`
	IncludesFiles       bool            `json:"includesFiles"`
	CurrencyDisplay     string          `json:"currencyDisplay"`
	TimeZone            string          `json:"timeZone"`
	Counts              []PreviewCount  `json:"counts"`
	FileCount           int             `json:"fileCount"`
	People              []PreviewPerson `json:"people"`
	SuggestedMeSourceId *uint           `json:"suggestedMeSourceId"`
	CategoriesMatched   int             `json:"categoriesMatched"`
	CategoriesNew       int             `json:"categoriesNew"`
	TagsMatched         int             `json:"tagsMatched"`
	TagsNew             int             `json:"tagsNew"`
	Warnings            []string        `json:"warnings"`
	Blockers            []string        `json:"blockers"`
	Problems            []string        `json:"problems"`
}

// BuildPreview compares an export with this server for the person importing it.
func BuildPreview(db *gorm.DB, archive *Archive, household *Household, importerUserId uint) (Preview, error) {
	manifest := archive.Manifest
	preview := Preview{
		ExportedAt: manifest.ExportedAt, AppVersion: manifest.AppVersion, IncludesFiles: manifest.IncludesFiles,
		CurrencyDisplay: manifest.Household.CurrencyDisplay, TimeZone: manifest.Household.TimeZone,
		Counts: []PreviewCount{}, People: []PreviewPerson{}, Warnings: []string{}, Blockers: []string{}, Problems: household.Problems,
	}
	for _, entry := range manifest.Entries {
		if entry.Kind == EntryKindTable && entry.Rows != nil {
			preview.Counts = append(preview.Counts, PreviewCount{Name: entry.Name[:len(entry.Name)-len(".csv")], Count: *entry.Rows})
		}
		if entry.Kind == EntryKindFile {
			preview.FileCount++
		}
	}

	usernames, err := existingUsernames(db)
	if err != nil {
		return Preview{}, err
	}
	var importer models.User
	if err := db.Model(models.User{}).Select("id", "username").First(&importer, importerUserId).Error; err != nil {
		return Preview{}, err
	}
	for _, user := range household.Users {
		match := MatchNameOnly
		if _, ok := usernames[user.Username]; ok {
			match = MatchAccount
		}
		if user.Username == importer.Username {
			id := user.ID
			preview.SuggestedMeSourceId = &id
		}
		preview.People = append(preview.People, PreviewPerson{SourceId: user.ID, Username: user.Username, DisplayName: user.DisplayName, Match: match})
	}

	categoriesByName, tagsByName, err := existingCatalog(db)
	if err != nil {
		return Preview{}, err
	}
	for _, category := range household.Categories {
		if _, ok := matchCategory(categoriesByName, category); ok {
			preview.CategoriesMatched++
		} else {
			preview.CategoriesNew++
		}
	}
	for _, tag := range household.Tags {
		if _, ok := tagsByName[strings.ToLower(tag.Name)]; ok {
			preview.TagsMatched++
		} else {
			preview.TagsNew++
		}
	}

	var settings models.SystemSettings
	if err := db.Model(models.SystemSettings{}).Order("id").Limit(1).Find(&settings).Error; err != nil {
		return Preview{}, err
	}
	if manifest.Household.CurrencyDisplay != "" && manifest.Household.CurrencyDisplay != settings.CurrencyDisplay {
		preview.Warnings = append(preview.Warnings, WarningCurrencySet)
	}
	if manifest.Household.TimeZone != "" && manifest.Household.TimeZone != settings.TimeZone {
		preview.Warnings = append(preview.Warnings, WarningTimeZoneSet)
	}
	if !manifest.IncludesFiles && len(household.Files) > 0 {
		preview.Warnings = append(preview.Warnings, WarningFilesNotIncluded)
	}
	if len(manifest.MissingFiles) > 0 {
		preview.Warnings = append(preview.Warnings, WarningFilesMissing)
	}
	if unknown, err := unknownGroupRoles(db, household); err != nil {
		return Preview{}, err
	} else if unknown {
		preview.Warnings = append(preview.Warnings, WarningUnknownGroupRole)
	}
	if replaced, err := templatesReplaced(db, household); err != nil {
		return Preview{}, err
	} else if replaced {
		preview.Warnings = append(preview.Warnings, WarningTemplateReplaced)
	}

	empty, err := HouseholdIsEmpty(db)
	if err != nil {
		return Preview{}, err
	}
	if !empty {
		preview.Blockers = append(preview.Blockers, BlockerHouseholdNotEmpty)
	}
	if household.ProblemCount() > 0 {
		preview.Blockers = append(preview.Blockers, BlockerInvalidRows)
	}
	return preview, nil
}

func templatesReplaced(db *gorm.DB, household *Household) (bool, error) {
	if len(household.Templates) == 0 {
		return false, nil
	}
	names := make([]string, 0, len(household.Templates))
	for _, template := range household.Templates {
		names = append(names, template.Name)
	}
	var count int64
	err := db.Model(models.ReportTemplate{}).Where("name IN ?", names).Count(&count).Error
	return count > 0, err
}

// unknownGroupRoles reports a membership whose group role this server does not have; the import makes
// that person a Member instead.
func unknownGroupRoles(db *gorm.DB, household *Household) (bool, error) {
	roles := repositories.NewRoleRepository(repositories.ImplicitCell(), db)
	seen := map[string]bool{}
	for _, member := range household.Members {
		if seen[member.Role] {
			continue
		}
		seen[member.Role] = true
		id, err := roles.GetGroupRoleIdByName(member.Role)
		if err != nil {
			return false, err
		}
		if id == nil {
			return true, nil
		}
	}
	return false, nil
}
