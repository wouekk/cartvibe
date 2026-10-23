# Authorization in depth

Purpose: the rationale behind roles, grants, paid-by and member isolation, API-key scopes and the All-group gate. `api/CLAUDE.md` holds the rules; read this before changing any of these layers.

## Roles and the permission registry

- `internal/permissions/registry.go` is the source of truth (`Descriptor{Key, Label, Description, Category, Scope}`).
  Keys are `scope.domain[.sub].action`, CRUD-granular, with standalone non-CRUD actions (`group.activities.rerun`).
  `permissions/registry_test.go` keeps the registry and the swagger `Permission` enum in step.
- **Catalog vs data.** The enum is the catalog (`Role.permissions`, `UpsertRoleCommand.permissions`, the `permission`
  query param). A user's effective permissions on `AppData` (`appPermissions`, `groupPermissions`) are data and ride as
  plain strings: they may be wildcards, and a closed enum on them failed whole AppData payloads twice in the past.
  Pinned by `TestAppDataEffectivePermissionsAreUntypedStrings`.
- **Matcher** (`permissions/matcher.go`, pure): `HasAll` (AND, the default) and `HasAny` over granted strings. `*` matches
  anything, a trailing `group.*` any deeper key, a mid-segment `*` one segment. No required key means deny. A `:sub`
  suffix is matched literally (`:any` superset semantics are not implemented).
- **Seeded roles.** `SeedSystemRoles` creates the immutable Legacy Admin / User / Viewer / Editor / Owner and the family
  roles **User** (app, `FamilyUserAppKeys`) and **Member** (group, `FamilyMemberGroupKeys`). Reconciliation is keyed on
  name and **add-only**: a missing permission is added on boot, nothing is removed. Legacy Admin and Legacy Owner are
  dynamic over the registry (every app / every group key), so a new key reaches admins on the next boot. Legacy User
  deliberately omits `app.users.read` (admin user list), `app.categories.read` / `app.tags.read` (the global catalogs;
  users get per-group filtered ones on AppData) and the reporting app permissions (reporting is admin-by-default).
- **Defaults.** Exactly one default role per scope (`IsDefault`). `EnsureDefaultRoles` flags Legacy User / Legacy Owner
  only when a scope has none, so an admin's choice is never overridden; the default cannot be deleted
  (`ErrRoleIsDefault`). `CreateUser` gives the first account Legacy Admin (so the bootstrap admin is never locked out),
  others the default. Assignment is best-effort: an unresolvable role leaves the FK nil rather than failing creation.
  Public `SignUp` strips a caller-supplied `AppRoleID`.
- **`AppRole.SkipDefaultGroupCreation`** (app scope only) skips the personal group at creation time only. A missing role
  falls back to creating the group; any other lookup error rolls the creation back (a transient DB error must not decide
  which groups an account gets).
- **Permission cache** (`services/permission_cache.go`) caches a role's permission list by `scope + roleId`, evicted in
  `RoleService.UpdateRole` / `DeleteRole`. Assignment is resolved fresh on every check.

## Category/tag grants

Two layers composed by **intersection**: group-role grants (the ceiling, shared) and group-member grants
(`GroupMemberCategoryGrant` / `GroupMemberTagGrant`, keyed `(UserID, GroupID, id)`, per membership). Union could only
add, so an individual assignment could never restrict anyone; intersection also keeps a role an auditable ceiling and
makes widening a role safe. Member grants hang off the membership because categories are global but visibility always
resolves in a group.

```text
role requires individual && member unconfigured -> see nothing (fail closed)
effective = ALL
if the role grants a non-empty set          -> effective ∩= role set
if the membership opted into restriction    -> effective ∩= membership set
if neither narrows                          -> unrestricted
```

- `GetGroupCategoryIdsForUser` / `GetGroupTagIdsForUser` return `(set, unrestricted, err)`: `unrestricted` = see all
  (`nil` set); restricted + empty set = see nothing. A non-member is unrestricted: grants only narrow; the handler gate is
  the access control.
- **Fail-closed flags.** `GroupMember.CategoryGrantsRestricted` / `TagGrantsRestricted` and
  `GroupRoleDefinition.PaidByVisibilityRestricted` / `ReportTemplateGrantsRestricted` are derived on save from the
  submitted sets, so a configuration whose rows are emptied by a cascade stays restricted instead of widening.
  `RequiresIndividualCategoryGrants` / `...TagGrants` make an unassigned member see nothing. They are persisted by
  `SetGroupRoleIndividualGrantConfig`, separate from `CreateGroupRole` / `UpdateGroupRole` to avoid four adjacent
  transposable bools.
- **Write surface** `PUT /group/{groupId}/member/{userId}/grants` with its own permission `group.members.grants.update`:
  folding it into `group.members.update` would let a restricted roster manager widen their own visibility. Ids come from
  the URL; submitted ids are checked for existence and against the role ceiling (`GrantCeilingViolation`), so the
  empty-intersection state is unreachable through the API.
- **Lifecycle.** Member grant rows have no FK to `group_members`, and teardown deletes memberships with raw deletes.
  Orphans would be re-adopted when a removed user rejoins, silently restoring revoked visibility. `DeleteMemberGrants*`
  and `DeleteOrphanedMemberGrants` are called from `UserService.DeleteUser`, `GroupService.DeleteGroup` and
  `GroupRepository.UpdateGroup`.
- **`UpdateGroup` carries the flags forward.** It rebuilds `GroupMember` rows from the command (flags at zero) and writes
  them twice, so it reads `GetMemberGrantFlagsForGroup` first and re-applies them; recomputing from surviving rows would
  defeat the fail-closed purpose. Pinned by `TestUpdateGroupPreservesRetainedMemberGrantFlags`.
- `GroupMember.CategoryGrants` / `TagGrants` are `gorm:"-"` view fields filled by `LoadMemberGrantsForGroup(s)`, kept out
  of GORM associations so `UpdateGroup`'s association write never touches them.
- **Caching.** The role layer is cached by group-role id (`services/grant_cache.go`); the member layer is not (one
  indexed lookup, batched per group by `newReceiptGrantFilter`).
- **Enforcement** is `services/grant_filter.go`: reads strip (`FilterReceiptCategoriesTags*`); aggregations substitute a
  `(Restricted)` bucket (`SubstituteRestrictedCategoriesTags`, used by the Dashboard overview; reports do it per line);
  writes check `ValidateCategoryTagSelection` (403), and a new-by-name category/tag needs `app.categories.create` /
  `app.tags.create`; list/export filters are narrowed by `IntersectReceiptFilterWithGrants` so a hidden id cannot probe
  existence. Holders of `app.categories.read` / `app.tags.read` bypass (`userBypassesGrants`).
- **Update keeps hidden associations.** `UpdateReceipt` replaces associations wholesale, so
  `MergeHiddenReceiptCategoriesTags` re-adds what the caller cannot see (after the selection check), and the response is
  stripped again.
- **AI candidates.** `ReceiptProcessingService.UserId` (0 for system) restricts the categories offered to the model to the
  triggering user's grants.

## Paid-by visibility

Row-level: `GroupRolePaidByUserGrant` plus `IncludeOwnPaidReceipts`. The caller's own id is unioned at resolution time,
never cached (the cache is role-keyed). There is no app-level bypass. A restricted empty set becomes the `IN (0)`
sentinel.

- **Paged list** (`GetPagedReceiptsByGroupId`): the predicate is added before the count. Single group:
  `paid_by_user_id IN (allowed)`; All view: a per-group disjunction.
- **Single receipt** (`HandleRequest`): the `ReceiptId(s)` blocks select `paid_by_user_id` and `enforcePaidByVisibility`
  403s. That one place covers get, images, comments, duplicate source, update/delete and the multi-id export.
  `HasAccess` calls `ReceiptPaidByVisible` itself so the desktop route guard agrees. `SkipPaidByVisibilityCheck` exists on
  `structs.Handler` for an accounting endpoint that must see every row; nothing sets it today.
- **Search** applies `ApplyPaidByDisjunction` in SQL before its `LIMIT`: a post-filter would let hidden receipts fill the
  limit.
- Write-side (which payer one may set) is governed by member isolation below, not by paid-by.

## The All group read gate

The synthetic All group is a real membership with an unrestricted role. Expanding it without re-checking each group let
members read receipts and category names in groups whose role denies it. So `GetPagedReceiptsByGroupId` takes a
`GroupReadableResolver` (`PermissionService.GroupPermissionResolver`) and drops every group where the caller lacks the
permission its direct path needs (`group.receipts.read`, or `group.reports.read` for reports), before the scope, the
paid-by disjunction and the count. The `CategoryTagVisibilityResolver` must be passed with it (the call fails closed
otherwise): it turns a category/tag filter into a per-group disjunction (`applyAllGroupCategoryTagFilter`), because
`IntersectReceiptFilterWithGrants` is a no-op on the All membership. AppData's All-group catalog is the union of the
real groups' visible sets. Search applies the same per-group read filter.

As a destination the All group is refused (400) before the create check in every create, quick scan and move path
(`isAllGroupDestination`), because its role would satisfy `group.receipts.create` and sidestep every real group's
controls. Moving a receipt also requires `group.receipts.create` on the destination and runs the selection checks there.

## Group member management

`UpdateGroup` replaces the roster. `GroupService.AuthorizeGroupMemberChanges` diffs it and, per added / role-changed /
removed row, requires `group.members.create|update|delete` and a **privilege ceiling**: the caller may only assign,
replace or remove a role whose permissions are a subset of their own (closes GHSA-89mm-9qfv-cjg3, self-escalation to
owner or evicting the owner). 403 `ErrGroupMemberChangeForbidden`.

`middleware.CanDeleteGroup` (the "don't delete your last group" guard) short-circuits for `app.groups.delete` holders; it
is not the authorization gate. `DeleteGroup` declares `OrAppPermissions: [app.groups.delete]` beside `group.delete`.

## Member isolation

`Group.IsolateMembers`: inside it a member cannot discover other members (directory, roster, receipts, comments,
activities, notifications). `GroupRoleDefinition.SeesAllMembers` is the supervisor exemption (sees everyone, visible to
everyone). Resolved **per (viewer, group)**, never as a union: co-members are visible only through a shared non-isolated
group and only on that group's surfaces. A cross-group aggregate may therefore omit a hidden group's money; the
isolation guarantee wins.

- `GetVisibleUserIdsForUserInGroup` (per group) feeds every group-scoped surface: `app.users.read`, a non-isolated group,
  or a supervisor role ⇒ unrestricted; a plain member ⇒ self ∪ supervisors; a non-member of an isolated group ⇒ self only
  (an `app.groups.read` holder must not see the roster); a non-member of an open group ⇒ unrestricted.
  `UserVisibleInGroup` is the single-row form; batch callers memoize via `groupVisibilityResolver`.
- `GetVisibleUserIdsForUser` (union) is used only for the flat `appData.users` directory, which clients use to resolve
  names.
- Enforcement: rosters filtered at serialization (`FilterGroupMembersForGroup(s)`, MCP `list_groups`), not inside
  `GetGroupsForUser`; receipts by intersecting into the paid-by set (`paidByAllowedForGroup`), so a hidden payer's
  receipt disappears everywhere; `member_masking.go` nulls `CreatedBy` fields (nulled, not `(Restricted)`: presence must
  not be announced) and drops hidden authors' comments; activities filtered in SQL before count/limit
  (`applyActivityVisibilityDisjunction`); comment notifications suppressed (`AuthorVisibilityResolver`).
- Writes: `enforceReceiptMemberVisibilitySelection` / `ValidateReceiptUserSelection` reject a payer outside the creator's
  visible set for the receipt's group.

## Report-template access

Three layers ANDed in `services/report_authz.go` (`CanActOnTemplate`, `VisibleTemplateIds`, `AllowedActionsForTemplate`,
`CanReportOverGroups`): the app action permission `app.reports.<action>`; the group ceiling (`group.reports.read` in every
group the template covers, from the `report_template_groups` index); and the per-template matrix
`GroupRoleReportTemplateGrant`. `app.reports.<action>All` bypasses the last two. The six template handlers enforce in
the body because the declarative gate is AND-only. The matrix is UX scoping: the ad-hoc `/report/generate` and a fresh
duplicate are not bound by it, and neither can widen data access beyond the group ceiling and grants, which every
generation re-resolves.

## API-key scopes

Enforced in `middleware.UnifiedAuthMiddleware`, the only place a key becomes `Claims`.

- **Exact match** (`apiKeyScopePermits` switches on the three `ApiKeyScope` constants): an earlier `strings.Contains`
  read `r,w` as both. This is the only request-time check: `Claims.Validate` never runs on the key path and the column is
  a plain string, so anything written around `UpsertApiKeyCommand.Validate` arrives unchecked.
- **Method decides, with an allowlist.** GET/HEAD/OPTIONS read; everything else writes unless listed in
  `readOnlyPostPaths` / `readOnlyPostPatterns` (`middleware/api_key_scope.go`). It fails closed for new write endpoints.
- **Read means disclosure to the caller**, not touching rows. A write that returns another entity's content is a read
  too: the two duplicate endpoints are in `readWritePostPatterns` and need `rw`.
- Do not derive read/write from declared permissions: `checkConnectivity` writes a `SystemTask` under a `.read`
  permission.
- `UpdateApiKeyLastUsedDate` stays outside the gate (authentication bookkeeping).
- Login, logout, refresh and signup never mount this middleware; MCP uses audience-bound tokens, not keys.

## AuthSource

`UnifiedAuthMiddleware` stamps `Claims.AuthSource` (`AuthSourceJwt` / `AuthSourceApiKey`). It is `json:"-"` (cannot ride
on or be forged into a token). Checks are written as "require `AuthSourceJwt`" so the zero value denies; never infer it
from `ApiKeyScope`. Consumers: OIDC link and unlink, self-delete and its provider confirmation. A `GET /oidc/link/{name}`
clears an `r` key's scope gate, and linking the key-holder's own IdP identity would turn a revocable scoped credential
into a permanent interactive login.
