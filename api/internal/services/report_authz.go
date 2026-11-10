package services

import (
	"fmt"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
)

// reportActionPerms maps each scopable report action to its base app permission
// and the "*All" bypass permission. read/generate/update/delete/duplicate operate
// on an existing template; create has no per-template scope and is handled by
// CanReportOverGroups instead.
var reportActionPerms = map[string]struct {
	base string
	all  string
}{
	"read":      {permissions.AppReportsRead, permissions.AppReportsReadAll},
	"generate":  {permissions.AppReportsGenerate, permissions.AppReportsGenerateAll},
	"update":    {permissions.AppReportsUpdate, permissions.AppReportsUpdateAll},
	"delete":    {permissions.AppReportsDelete, permissions.AppReportsDeleteAll},
	"duplicate": {permissions.AppReportsDuplicate, permissions.AppReportsDuplicateAll},
}

// reportScopableActions is the ordered action list AllowedActionsForTemplate
// evaluates, giving the per-row action set a stable order.
var reportScopableActions = []string{"read", "generate", "update", "delete", "duplicate"}

// CanActOnTemplate reports whether the user may perform action on a saved report
// template: the "*All" bypass short-circuits to allowed; otherwise the base app
// permission is required, plus group.reports.read in EVERY group the template covers.
func (service PermissionService) CanActOnTemplate(userId uint, templateId uint, action string) (bool, error) {
	actionPerms, ok := reportActionPerms[action]
	if !ok {
		return false, fmt.Errorf("unknown report template action %q", action)
	}

	hasAll, err := service.HasAppPermissions(userId, actionPerms.all)
	if err != nil {
		return false, err
	}
	if hasAll {
		return true, nil
	}

	hasBase, err := service.HasAppPermissions(userId, actionPerms.base)
	if err != nil {
		return false, err
	}
	if !hasBase {
		return false, nil
	}

	groupIds, err := repositories.NewReportTemplateRepository(service.TX).GetGroupIdsByTemplateId(templateId)
	if err != nil {
		return false, err
	}

	return service.canReportInEveryGroup(userId, groupIds)
}

// AllowedActionsForTemplate returns the subset of scopable actions the user may
// perform on a template, factoring in the base/"*All" app permissions and the
// group-access ceiling. It drives the list's per-row
// action buttons, so the client can gate purely off this set. The template's
// covered groups are loaded once and reused across every action.
func (service PermissionService) AllowedActionsForTemplate(userId uint, templateId uint) ([]string, error) {
	groupIds, err := repositories.NewReportTemplateRepository(service.TX).GetGroupIdsByTemplateId(templateId)
	if err != nil {
		return nil, err
	}

	inEveryGroup, err := service.canReportInEveryGroup(userId, groupIds)
	if err != nil {
		return nil, err
	}

	allowed := make([]string, 0, len(reportScopableActions))
	for _, action := range reportScopableActions {
		actionPerms := reportActionPerms[action]

		hasAll, err := service.HasAppPermissions(userId, actionPerms.all)
		if err != nil {
			return nil, err
		}
		if hasAll {
			allowed = append(allowed, action)
			continue
		}

		hasBase, err := service.HasAppPermissions(userId, actionPerms.base)
		if err != nil {
			return nil, err
		}
		if hasBase && inEveryGroup {
			allowed = append(allowed, action)
		}
	}

	return allowed, nil
}

// VisibleTemplateIds returns the ids of the templates a user may see in the list.
// When the user holds app.reports.readAll the result is unrestricted (a nil id
// slice and unrestricted=true, so the repository applies no filter); a user without
// even base app.reports.read sees nothing; otherwise every indexed template is
// evaluated against the read ceiling and the passers collected.
func (service PermissionService) VisibleTemplateIds(userId uint) (ids []uint, unrestricted bool, err error) {
	hasReadAll, err := service.HasAppPermissions(userId, permissions.AppReportsReadAll)
	if err != nil {
		return nil, false, err
	}
	if hasReadAll {
		return nil, true, nil
	}

	hasRead, err := service.HasAppPermissions(userId, permissions.AppReportsRead)
	if err != nil {
		return nil, false, err
	}
	if !hasRead {
		return []uint{}, false, nil
	}

	mappings, err := repositories.NewReportTemplateRepository(service.TX).GetAllTemplateGroupMappings()
	if err != nil {
		return nil, false, err
	}

	visible := make([]uint, 0, len(mappings))
	for templateId, groupIds := range mappings {
		ok, err := service.canReportInEveryGroup(userId, groupIds)
		if err != nil {
			return nil, false, err
		}
		if ok {
			visible = append(visible, templateId)
		}
	}

	return visible, false, nil
}

// CanReportOverGroups reports whether the user may attach a template to the given
// groups (on create, or when an update retargets the group set). The action's
// "*All" bypass permission (createAll / updateAll) short-circuits to allowed;
// otherwise group.reports.read is required in every listed group — a template must
// never be pointed at a group whose receipts the caller cannot read.
func (service PermissionService) CanReportOverGroups(userId uint, groupIds []string, bypassPermission string) (bool, error) {
	hasBypass, err := service.HasAppPermissions(userId, bypassPermission)
	if err != nil {
		return false, err
	}
	if hasBypass {
		return true, nil
	}

	for _, groupIdStr := range groupIds {
		groupId, err := utils.StringToUint(groupIdStr)
		if err != nil {
			return false, err
		}
		hasRead, err := service.HasGroupPermissions(userId, groupId, permissions.GroupReportsRead)
		if err != nil {
			return false, err
		}
		if !hasRead {
			return false, nil
		}
	}

	return true, nil
}

// canReportInEveryGroup checks the group-access ceiling: group.reports.read in every
// group a template covers. It does NOT check the app-permission axis or the "*All"
// bypass — callers handle those. The per-template matrix a group role could carry
// went with fixed roles (2026-11).
func (service PermissionService) canReportInEveryGroup(userId uint, groupIds []uint) (bool, error) {
	for _, groupId := range groupIds {
		hasRead, err := service.HasGroupPermissions(userId, groupId, permissions.GroupReportsRead)
		if err != nil {
			return false, err
		}
		if !hasRead {
			return false, nil
		}

	}

	return true, nil
}
