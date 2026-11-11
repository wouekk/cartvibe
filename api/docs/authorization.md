# Authorization in depth

Purpose: the rationale behind the fixed roles, the permission gate and the All-group gate. `api/CLAUDE.md` holds the
rules; read this before changing who may do or see what.

## The model: four fixed roles, and a household that shares everything

Since 2026-11 (audit item C14) there are four roles and nothing an admin can tune:

| Scope | Role | Row name | Holds |
|---|---|---|---|
| app | Admin | `Legacy Admin` | every app key |
| app | User | `User` | `FamilyUserAppKeys`: own account and preferences, notifications, search, the shared categories and tags, the AI page |
| household | Owner (shown as Admin) | `Legacy Owner` | every group key |
| household | Member (shown as User) | `Member` | `FamilyMemberGroupKeys`: receipts (their note included), shopping lists, the activity log |

Inside a household everyone sees everything: every receipt whoever paid, every category and tag, every member,
note and activity. What differs between an Owner and a Member is what they may change about the household
itself (its name and look, its receipt settings, its members, deleting it) and whether they read its reports.

Why it was cut down. The model before it was built for a company: seven seeded roles, custom roles, category and tag
grants on two layers, paid-by visibility, member isolation, a per-template report matrix and role-required receipt
fields, in ten tables, with fail-closed flags to keep a half-deleted configuration restricted. The app offered two
roles and no page to edit any of it, so the code a mistake in which is a privacy bug was the code nobody could reach.
A family does not hide receipts from each other.

Do not rebuild a layer of it in passing. A rule that narrows what one member sees of another's is a product decision
for the owner, and it would have to come back whole: in the list, the single read, search, export, reports, the
Dashboard, notifications and the MCP tools at once.

## Roles and the permission registry

- `internal/permissions/registry.go` is the source of truth (`Descriptor{Key, Label, Description, Category, Scope}`).
  Keys are `scope.domain[.sub].action`, CRUD-granular, with standalone non-CRUD actions (`group.activities.rerun`).
  `permissions/registry_test.go` keeps the registry and the swagger `Permission` enum in step.
- **Catalog vs data.** The enum is the catalog (`Role.permissions`, the `permission` query param). A user's effective
  permissions on `AppData` (`appPermissions`, `groupPermissions`) are data and ride as plain strings: a closed enum on
  them failed whole AppData payloads twice in the past. Pinned by `TestAppDataEffectivePermissionsAreUntypedStrings`.
- **Matcher** (`permissions/matcher.go`, pure): `HasAll` (AND, the default) and `HasAny` over granted strings. `*` matches
  anything, a trailing `group.*` any deeper key, a mid-segment `*` one segment. No required key means deny. A `:sub`
  suffix is matched literally (`:any` superset semantics are not implemented).
- **The code is the roles.** `SeedSystemRoles` runs on every start, keyed on the row name so the ids people are assigned
  by never change, and brings each row to exactly its list: a key the row lacks is added, a key that left the list or
  the registry is removed. Admin and Owner are dynamic over the registry (every app key, every group key), so a new
  key reaches them at the next start. User and Member are fixed lists in `permissions/family.go`: a key reaches a
  family member only by being added there, and `permissions/fixed_roles_test.go` pins both lists and what stays with
  the Admin and the Owner.
- **Defaults.** `EnsureDefaultRoles` marks User as the default app role and Owner as the default household role on
  every start, and no other. `CreateUser` gives the first account Admin (so the bootstrap admin is never locked out)
  and every other account without an explicit role the default; that covers sign-up (which strips a submitted
  `AppRoleID`) and provider sign-in. Assignment is best-effort: an unresolvable role leaves the FK nil rather than
  failing creation. The person who creates a household is its Owner.
- **Nothing edits a role.** `GET /role` is the only role route (`app.roles.read`, so the people pages can assign a role
  by id). `RoleRepository.CreateAppRole` / `CreateGroupRole` are kept for tests: a narrower role is how a test proves
  that a gate refuses.
- **Permission cache** (`services/permission_cache.go`) caches a role's permission list by `scope + roleId` for the life
  of the process: the lists change only at start, before a request is served. Assignment is resolved fresh on every
  check.
- **Moving an older install** (`repositories/fixed_roles.go`, data migration `fixed-roles-v1`): everyone on another app
  role becomes Admin when that role could manage people or roles (`app.users.update`, or the retired
  `app.roles.update`: either could have made itself anything), and User otherwise; every membership on another
  household role becomes Owner when that role could change the household or its members (`group.update`,
  `group.members.update`), and Member otherwise. Someone with no role keeps none. The other roles are deleted and the
  six grant tables dropped. It runs once, in one transaction, after the snapshot a new version takes; it cannot be
  undone. The columns the removed rules lived in stay, unused, because migrations are additive.

## The handler gate

`HandleRequest` (`handlers/generic_handler.go`) resolves the permissions a handler declares from the database. A
receipt named by id is judged in its own household: the gate reads the receipt's `group_id` and checks the declared
group permissions there, and an id that does not exist answers the same 403 as a refusal. That one place covers the
single read, images, duplicate, update, delete and the multi-id export.

`ReceiptService.GetReceiptForUser` is the same rule as a service, shared by the REST read and the MCP tool: read
permission in the receipt's household, checked again after the full load in case the receipt moved in between.

A category or tag sent by name instead of by id is created by the receipt write, so that write also needs
`app.categories.create` / `app.tags.create` (`enforceNewCategoryTagPermission`). Any existing category or tag may be
picked by anyone who may write the receipt.

## The All group read gate

The synthetic All group is a real membership, on the default role. Expanding it without re-checking each household
would let a member read receipts in a household whose role denies it. So `GetPagedReceiptsByGroupId` takes a
`GroupReadableResolver` (`PermissionService.GroupPermissionResolver`) and drops every household where the caller lacks
the permission its direct path needs (`group.receipts.read`, or `group.reports.read` for reports), before the scope
and the count. Search applies the same per-household read filter. AppData's catalog for the All group is the whole
pool, as for any household.

As a destination the All group is refused (400) before the create check in every create, quick scan and move path
(`isAllGroupDestination`), because its role would satisfy `group.receipts.create` and the receipt would belong to no
household. Moving a receipt also requires `group.receipts.create` on the destination.

## Group member management

`UpdateGroup` replaces the roster. `GroupService.AuthorizeGroupMemberChanges` diffs it and, per added / role-changed /
removed row, requires `group.members.create|update|delete` and a **privilege ceiling**: the caller may only assign,
replace or remove a role whose permissions are a subset of their own (closes GHSA-89mm-9qfv-cjg3, self-escalation to
owner or evicting the owner). 403 `ErrGroupMemberChangeForbidden`. With two household roles it reads: only an Owner
changes the roster, and a Member cannot.

`middleware.CanDeleteGroup` (the "don't delete your last group" guard) short-circuits for `app.groups.delete` holders; it
is not the authorization gate. `DeleteGroup` declares `OrAppPermissions: [app.groups.delete]` beside `group.delete`.

## Report-template access

Two layers ANDed in `services/report_authz.go` (`CanActOnTemplate`, `VisibleTemplateIds`, `AllowedActionsForTemplate`,
`CanReportOverGroups`): the app action permission `app.reports.<action>`, and the group ceiling (`group.reports.read`
in every household the template covers, from the `report_template_groups` index). `app.reports.<action>All` bypasses
the ceiling. The template handlers enforce in the body because the declarative gate is AND-only. Reports are an
Admin's: a User holds no report permission and a Member no `group.reports.read`.

## The household export

`GET /backup/export` (`app.backup.export`) is a whole-install dump for moving servers: every household and person,
without secrets. The key is admin-only (never in `FamilyUserAppKeys`). The import (`app.backup.import`, admin-only
too) runs only into an empty household; a role name it does not know (an export from before fixed roles) becomes
Member, and every imported person is a User.

## Households

The first account gets a group named `Household` (`HouseholdGroupName`, flagged `is_household`); later accounts join
it as Member (`joinHouseholdGroup`) and get no personal group. An install without a Household group (one that
predates it) gives accounts a personal "My Receipts". Every account also gets the All group.
