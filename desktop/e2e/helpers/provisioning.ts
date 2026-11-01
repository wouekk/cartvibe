import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
  request as pwRequest,
} from '@playwright/test';
import { creds, type Role } from './auth';

// Shared provisioning for permission e2e specs. Roles, users and groups are created and torn down through the admin
// API: the role editor and the custom-role pickers are gone since the family rework. `DELETE /api/user/{id}`
// hard-deletes, and deleting a group frees its members' group-role assignment, so the API tears down cleanly (a role in
// use cannot be deleted: user and group first, then the role).

export function uniqueName(tag: string): string {
  // Two workers can mint a name in the same millisecond (a delete by name then removes the wrong twin), so a random
  // part follows the clock.
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `e2e-${tag}-${Date.now()}${random}`;
}

/** The 15th of the current UTC month, as an ISO instant: a date the receipts table's default "this month" lists. */
export function midMonthIso(): string {
  return `${new Date().toISOString().slice(0, 7)}-15T00:00:00Z`;
}

export interface CreateRoleOptions {
  name: string;
  /** Role-type card to pick, e.g. 'Application role' | 'Group role'. */
  type: 'Application role' | 'Group role';
  /** Starting template button, matched by (sub)string, e.g. 'Start from scratch' | 'Viewer'. */
  preset: string;
  /** Resource categories to flip fully on, e.g. ['Account', 'Notifications', 'Groups']. */
  enableCategories?: string[];
  /**
   * Individual permissions to switch OFF after applying the preset. Identify the
   * accordion by its resource key (key minus last segment, e.g. 'group.comments')
   * and the row by its label (e.g. 'Read Comments').
   */
  disablePermissions?: { panelKey: string; label: string }[];
  /**
   * Group-role paid-by visibility (the "Visible paid-by users" picker). Pin
   * "Their own receipts" and/or specific users by display name. Leaving both
   * unset keeps the role unrestricted (members see every payer's receipts).
   */
  paidByOwn?: boolean;
  paidByUsers?: string[];
  /**
   * App-role only: tick "Don't create a personal group for new users with this
   * role" in the "Group creation" card, so accounts created with the role skip
   * the automatic "My Receipts" group (the virtual "All" group is still made).
   */
  skipDefaultGroup?: boolean;
  /**
   * Group-role category/tag grants (the shared app-grant-picker), by NAME. This
   * is the ceiling a member's individual assignment narrows within. Leaving both
   * unset keeps the role unrestricted (members see every category/tag).
   */
  categoryGrants?: string[];
  tagGrants?: string[];
  /**
   * Flips "Require an individual category/tag assignment for each member", so a
   * member with no assignment sees nothing instead of the role's set.
   */
  requiresIndividualCategories?: boolean;
  requiresIndividualTags?: boolean;
  /**
   * Group-role only: ticks "Require a comment on receipts" / "Require an image
   * on receipts", so members must keep at least one of each on the group's
   * receipts (enforced server-side on create, update and delete-last).
   */
  requireReceiptComment?: boolean;
  requireReceiptImage?: boolean;
}

// Permission keys behind the role form's presets and toggles. The role editor UI is gone (the family rework offers
// Admin and User only), so a spec's custom role is created through the API from the same names the form used.
const PRESET_BASE_ROLES: Record<string, { scope: 'APP' | 'GROUP'; base: string | null }> = {
  'Start from scratch': { scope: 'APP', base: null },
  'Read Only': { scope: 'APP', base: 'Legacy User' },
  Administrator: { scope: 'APP', base: 'Legacy Admin' },
  Viewer: { scope: 'GROUP', base: 'Legacy Viewer' },
  'Receipt Editor': { scope: 'GROUP', base: 'Legacy Editor' },
  'Group Manager': { scope: 'GROUP', base: 'Legacy Owner' },
};

// "Toggle all <Category> permissions" -> key prefix.
const CATEGORY_PREFIXES: Record<string, string> = {
  Account: 'app.account.',
  Notifications: 'app.notifications.',
  Groups: 'app.groups.',
  Reports: 'app.reports.',
  Receipts: 'group.receipts.',
};

// Permission row label -> key.
const PERMISSION_LABEL_KEYS: Record<string, string> = {
  'Delete Any Group': 'app.groups.delete',
  'Create Reports For Any Group': 'app.reports.createAll',
  'Duplicate All Report Templates': 'app.reports.duplicateAll',
  'Duplicate Report Templates': 'app.reports.duplicate',
  'Generate All Reports': 'app.reports.generateAll',
  'Generate Reports': 'app.reports.generate',
  'Save Report Templates': 'app.reports.create',
  'Update All Report Templates': 'app.reports.updateAll',
  'Update Report Templates': 'app.reports.update',
  'Create Comments': 'group.comments.create',
  'Delete Comments': 'group.comments.delete',
  'Create Shopping Lists': 'group.shopping-lists.create',
  'Update Shopping Lists': 'group.shopping-lists.update',
  'Delete Shopping Lists': 'group.shopping-lists.delete',
};

interface RoleRow {
  id: number;
  name: string;
  scope: 'APP' | 'GROUP';
  permissions?: string[];
}

async function apiListRoles(api: APIRequestContext): Promise<RoleRow[]> {
  const res = await api.get('/api/role');
  if (!res.ok()) {
    throw new Error(`list roles failed: HTTP ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as RoleRow[];
}

async function apiUsersByDisplayName(api: APIRequestContext): Promise<Map<string, number>> {
  const users = (await (await api.get('/api/user/')).json()) as { id: number; displayName: string }[];
  return new Map(users.map((u) => [u.displayName, u.id]));
}

async function namesToIds(
  api: APIRequestContext,
  path: 'category' | 'tag',
  names?: string[],
): Promise<number[] | undefined> {
  if (!names?.length) {
    return undefined;
  }
  const rows = (await (await api.get(`/api/${path}`)).json()) as { id: number; name: string }[];
  return names.map((name) => {
    const row = rows.find((r) => r.name === name);
    if (!row) {
      throw new Error(`${path} ${name} not found`);
    }
    return row.id;
  });
}

/**
 * Creates a custom role through the admin API from the form's option names (preset, resource categories switched on,
 * single permissions switched off). Replaces the removed role editor UI; the [page] argument is kept so specs still
 * pass their admin page and is not used.
 */
export async function createRole(_page: Page | null, opts: CreateRoleOptions): Promise<void> {
  const scope: 'APP' | 'GROUP' = opts.type === 'Group role' ? 'GROUP' : 'APP';
  const preset = PRESET_BASE_ROLES[opts.preset];
  if (!preset) {
    throw new Error(`unknown role preset ${opts.preset}`);
  }
  await withAdminApi(async (api) => {
    const roles = await apiListRoles(api);
    const universe = new Set<string>(roles.filter((r) => r.scope === scope).flatMap((r) => r.permissions ?? []));
    const base = preset.base ? roles.find((r) => r.name === preset.base && r.scope === scope) : undefined;
    const permissions = new Set<string>(base?.permissions ?? []);
    for (const category of opts.enableCategories ?? []) {
      const prefix = CATEGORY_PREFIXES[category];
      if (!prefix) {
        throw new Error(`unknown permission category ${category}`);
      }
      [...universe].filter((key) => key.startsWith(prefix)).forEach((key) => permissions.add(key));
    }
    for (const { label } of opts.disablePermissions ?? []) {
      const key = PERMISSION_LABEL_KEYS[label];
      if (!key) {
        throw new Error(`unknown permission label ${label}`);
      }
      permissions.delete(key);
    }
    const users = opts.paidByUsers?.length ? await apiUsersByDisplayName(api) : null;
    const res = await api.post('/api/role', {
      data: {
        name: opts.name,
        description: '',
        scope,
        permissions: [...permissions],
        ...(opts.skipDefaultGroup ? { skipDefaultGroupCreation: true } : {}),
        ...(opts.paidByOwn ? { includeOwnPaidReceipts: true } : {}),
        ...(users ? { paidByUserGrants: opts.paidByUsers!.map((n) => users.get(n)!) } : {}),
        categoryGrants: await namesToIds(api, 'category', opts.categoryGrants),
        tagGrants: await namesToIds(api, 'tag', opts.tagGrants),
        ...(opts.requiresIndividualCategories ? { requiresIndividualCategoryGrants: true } : {}),
        ...(opts.requiresIndividualTags ? { requiresIndividualTagGrants: true } : {}),
        ...(opts.requireReceiptComment ? { requireReceiptComment: true } : {}),
        ...(opts.requireReceiptImage ? { requireReceiptImage: true } : {}),
      },
    });
    if (!res.ok()) {
      throw new Error(`create role ${opts.name} failed: HTTP ${res.status()} ${await res.text()}`);
    }
  });
}

/** Creates a user assigned the app role [opts.role] through the admin API (the Add User dialog's role select has no accessible name). */
export async function createUserWithRole(
  _page: Page | null,
  opts: { username: string; password: string; role: string; createdWithRole?: boolean },
): Promise<void> {
  // A new account is greeted by a welcome dialog that covers the page (UserPreferences.onboardingPending). The
  // account can only switch it off itself, and a custom role may lack app.user-preferences.*, so the user starts on
  // Legacy User, turns the dialog off, and only then gets the requested role. `createdWithRole` skips that and
  // creates the account on the role at once, for specs about what the role does at creation time (the welcome
  // dialog does not matter to an API-only account).
  await withAdminApi(async (api) => {
    const roles = await apiListRoles(api);
    const role = roles.find((r) => r.name === opts.role && r.scope === 'APP');
    const starter = roles.find((r) => r.name === 'Legacy User' && r.scope === 'APP');
    if (!role || !starter) {
      throw new Error(`app role ${opts.role} not found`);
    }
    if (opts.createdWithRole) {
      const direct = await api.post('/api/user', {
        data: {
          username: opts.username,
          password: opts.password,
          displayName: opts.username,
          isDummyUser: false,
          appRoleId: role.id,
        },
      });
      if (!direct.ok()) {
        throw new Error(`create user ${opts.username} failed: HTTP ${direct.status()} ${await direct.text()}`);
      }
      return;
    }
    const res = await api.post('/api/user', {
      data: {
        username: opts.username,
        password: opts.password,
        displayName: opts.username,
        isDummyUser: false,
        appRoleId: starter.id,
      },
    });
    if (!res.ok()) {
      throw new Error(`create user ${opts.username} failed: HTTP ${res.status()} ${await res.text()}`);
    }
    await withApiAsCreds(opts.username, opts.password, async (userApi) => {
      const preferences = (await (await userApi.get('/api/userPreferences')).json()) as Record<string, unknown>;
      await userApi.put('/api/userPreferences', { data: { ...preferences, onboardingPending: false } });
    });
    if (role.id !== starter.id) {
      const users = (await (await api.get('/api/user/')).json()) as { id: number; username: string }[];
      const created = users.find((u) => u.username === opts.username)!;
      const update = await api.put(`/api/user/${created.id}`, { data: { ...created, appRoleId: role.id } });
      if (!update.ok()) {
        throw new Error(`assign ${opts.role} to ${opts.username} failed: HTTP ${update.status()} ${await update.text()}`);
      }
    }
  });
}

/**
 * Creates a group owned by the admin with [opts.memberDisplayName] added as [opts.roleName] (a custom group role the
 * household member picker would not offer), and returns the new group's id.
 */
export async function createGroupWithMember(
  _page: Page | null,
  opts: { groupName: string; memberDisplayName: string; roleName: string },
): Promise<string> {
  return withAdminApi(async (api) => {
    const roles = await apiListRoles(api);
    const role = roles.find((r) => r.name === opts.roleName && r.scope === 'GROUP');
    if (!role) {
      throw new Error(`group role ${opts.roleName} not found`);
    }
    const memberId = (await apiUsersByDisplayName(api)).get(opts.memberDisplayName);
    if (!memberId) {
      throw new Error(`user ${opts.memberDisplayName} not found`);
    }
    const created = await apiCreateGroup(api, opts.groupName);
    const existing = await apiGetGroupMembers(api, created.id);
    const res = await apiSetGroupRoster(api, created.id, {
      name: opts.groupName,
      members: [
        ...existing.map((m) => ({ userId: m.userId, groupRoleId: m.groupRoleId })),
        { userId: memberId, groupRoleId: role.id },
      ],
    });
    if (!res.ok()) {
      throw new Error(`add member to ${opts.groupName} failed: HTTP ${res.status()} ${await res.text()}`);
    }
    return String(created.id);
  });
}

// --- API teardown -----------------------------------------------------------
//
// Cleanup runs over the admin API (see the file header for why the UI can't do
// it). `request.newContext` against E2E_BASE_URL reuses the dev-server proxy to
// `/api`; the admin login cookie is stored on the context for later DELETEs.

/**
 * POST /api/login, retried with backoff while nginx's login limit answers 503 (30 a minute; parallel workers can
 * hit it). Any other status is returned at once, so a wrong password still fails fast.
 */
export async function loginWithRetry(
  api: APIRequestContext,
  username: string,
  password: string,
  delaysMs: readonly number[] = [500, 1000, 2000, 4000, 8000],
): Promise<APIResponse> {
  let res = await api.post('/api/login', { data: { username, password } });
  for (const delay of delaysMs) {
    if (res.status() !== 503) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    res = await api.post('/api/login', { data: { username, password } });
  }
  return res;
}

const SESSION_CACHE_MS = 5 * 60_000;
const sessionCache = new Map<string, { state: Awaited<ReturnType<APIRequestContext["storageState"]>>; at: number }>();

const RETRY_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'fetch']);

/**
 * nginx allows 10 requests a second with a burst of 20 for the whole run (every worker shares one address) and answers
 * 503 beyond that. A provisioning call that hits it is repeated after a short wait, so a burst of setup calls never
 * fails a spec.
 */
export function retryOn503(api: APIRequestContext): APIRequestContext {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string' || !RETRY_METHODS.has(prop) || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        let res: APIResponse = await value.apply(target, args);
        for (const delay of [300, 600, 1200, 2400, 4800]) {
          if (res.status() !== 503) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
          res = await value.apply(target, args);
        }
        return res;
      };
    },
  });
}

const apiBaseUrl = (): string =>
  process.env.E2E_BASE_URL ?? 'http://localhost:4200';

/**
 * Opens an `APIRequestContext` authenticated with the given credentials, runs
 * [fn], and disposes it. Use for a user the test provisioned itself, which has
 * no `E2E_*` env credentials — for a fixture account use `withApiAs` instead.
 */
export async function withApiAsCreds<T>(
  username: string,
  password: string,
  fn: (api: APIRequestContext) => Promise<T>,
): Promise<T> {
  // The login is cached per account for a few minutes (the access token lives 20): provisioning helpers log in
  // several times per spec, and nginx limits /api/login to 30 a minute for the whole run.
  const key = `${username}\u0000${password}`;
  const cached = sessionCache.get(key);
  if (cached && Date.now() - cached.at < SESSION_CACHE_MS) {
    const api = await pwRequest.newContext({ baseURL: apiBaseUrl(), storageState: cached.state });
    try {
      return await fn(retryOn503(api));
    } finally {
      await api.dispose();
    }
  }
  const api = await pwRequest.newContext({ baseURL: apiBaseUrl(), storageState: undefined });
  try {
    const res = await loginWithRetry(api, username, password);
    if (!res.ok()) {
      throw new Error(`${username} API login failed: HTTP ${res.status()}`);
    }
    sessionCache.set(key, { state: await api.storageState(), at: Date.now() });
    return await fn(retryOn503(api));
  } finally {
    await api.dispose();
  }
}

/**
 * Opens an `APIRequestContext` authenticated as the given e2e [role], runs [fn],
 * and disposes it. Use to drive API calls AS a specific user — e.g. asserting a
 * restricted user's request is denied, or admin teardown.
 */
export async function withApiAs<T>(
  role: Role,
  fn: (api: APIRequestContext) => Promise<T>,
): Promise<T> {
  const { username, password } = creds(role);
  return withApiAsCreds(username, password, fn);
}

/**
 * Opens an admin-authenticated `APIRequestContext`, runs [fn], and disposes it.
 * Use in `afterAll` for best-effort teardown of provisioned roles/users/groups.
 */
export async function withAdminApi<T>(
  fn: (api: APIRequestContext) => Promise<T>,
): Promise<T> {
  return withApiAs('admin', fn);
}

/** Returns the id of the user with [username] (via the admin user list). */
export async function apiGetUserId(
  api: APIRequestContext,
  username: string,
): Promise<number> {
  const users = (await (await api.get('/api/user/')).json()) as {
    id: number;
    username: string;
  }[];
  const user = users.find((u) => u.username === username);
  if (!user) {
    throw new Error(`user ${username} not found`);
  }
  return user.id;
}

/**
 * Returns the names of the groups the authenticated caller belongs to, including
 * the virtual "All" group. `GET /api/group/` lists the caller's own groups and is
 * gated on app.account.read, so the caller's role must grant it.
 */
export async function apiGroupNames(api: APIRequestContext): Promise<string[]> {
  const res = await api.get('/api/group/');
  if (!res.ok()) {
    throw new Error(
      `list groups failed: HTTP ${res.status()} ${await res.text()}`,
    );
  }
  const groups = (await res.json()) as { name: string }[];
  return groups.map((group) => group.name);
}

/** Creates a minimal OPEN receipt and returns its id. */
export async function apiCreateReceipt(
  api: APIRequestContext,
  opts: {
    groupId: number | string;
    paidByUserId: number;
    name: string;
    /**
     * Receipt date as an ISO string. Defaults to a fixed date in 2024 (the report specs count on it). The receipts
     * table opens on "this month", so a spec that looks for the row there passes `midMonthIso()`.
     */
    date?: string;
    /**
     * Receipt status. Defaults to OPEN. Pass RESOLVED to have the server stamp
     * `resolvedDate` — the only way to seed a receipt the Resolved Date filter
     * can match.
     */
    status?: string;
    /**
     * Receipt amount as a decimal string. Defaults to '10.00'. Specs that assert
     * over summed money need distinguishable amounts — a uniform 10.00 makes
     * every total a multiple of ten, which cannot tell a correct sum from a
     * miscount.
     */
    amount?: string;
    /** Existing categories / tags to attach, as returned by apiCreateCategory / apiCreateTag. */
    categories?: { id: number; name: string }[];
    tags?: { id: number; name: string }[];
  },
): Promise<number> {
  api = retryOn503(api);
  const res = await api.post('/api/receipt', {
    data: {
      name: opts.name,
      amount: opts.amount ?? '10.00',
      date: opts.date ?? '2024-01-01T00:00:00Z',
      groupId: Number(opts.groupId),
      paidByUserId: opts.paidByUserId,
      status: opts.status ?? 'OPEN',
      ...(opts.categories ? { categories: opts.categories } : {}),
      ...(opts.tags ? { tags: opts.tags } : {}),
    },
  });
  if (!res.ok()) {
    throw new Error(
      `create receipt failed: HTTP ${res.status()} ${await res.text()}`,
    );
  }
  const receipt = (await res.json()) as { id: number };
  return receipt.id;
}

/**
 * Creates a comment on [receiptId] and returns its id. The comment is owned by
 * whoever the [api] context is authenticated as (the per-comment delete control
 * only renders for the logged-in user's own comments).
 */
export async function apiCreateComment(
  api: APIRequestContext,
  opts: { receiptId: number; comment: string },
): Promise<number> {
  const res = await api.post('/api/comment/', {
    data: { comment: opts.comment, receiptId: opts.receiptId },
  });
  if (!res.ok()) {
    throw new Error(
      `create comment failed: HTTP ${res.status()} ${await res.text()}`,
    );
  }
  const comment = (await res.json()) as { id: number };
  return comment.id;
}

/**
 * Creates a group via the admin API (the caller is auto-added as owner) and
 * returns its id + name. Create only needs name+status; members are required
 * on update, not create.
 */
export async function apiCreateGroup(
  api: APIRequestContext,
  name: string,
): Promise<{ id: number; name: string }> {
  api = retryOn503(api);
  const res = await api.post('/api/group', {
    data: { name, status: 'ACTIVE' },
  });
  if (!res.ok()) {
    throw new Error(
      `create group failed: HTTP ${res.status()} ${await res.text()}`,
    );
  }
  const group = (await res.json()) as { id: number; name: string };
  return { id: group.id, name: group.name };
}

/** Hard-deletes the user with [username] (frees any app-role assignment). */
export async function apiDeleteUserByName(
  api: APIRequestContext,
  username: string,
): Promise<void> {
  const users = (await (await api.get('/api/user/')).json()) as {
    id: number;
    username: string;
  }[];
  const user = users.find((u) => u.username === username);
  if (user) {
    await api.delete(`/api/user/${user.id}`);
  }
}

/** Deletes the group [groupId] (frees its members' group-role assignment). */
export async function apiDeleteGroupById(
  api: APIRequestContext,
  groupId: string,
): Promise<void> {
  await api.delete(`/api/group/${groupId}`);
}

/** Returns a group id (as a string) the caller can generate reports over. */
export async function apiFirstReportGroupId(api: APIRequestContext): Promise<string> {
  const appData = (await (await api.get('/api/user/appData')).json()) as {
    groupPermissions?: Record<string, string[]>;
  };
  const groupPermissions = appData.groupPermissions ?? {};
  const groupId = Object.keys(groupPermissions).find((id) =>
    (groupPermissions[id] ?? []).includes('group.reports.read'),
  );
  if (!groupId) {
    throw new Error('no group with group.reports.read for the caller');
  }
  return groupId;
}

/**
 * Resolves a category the caller can both report on and see in the builder: a group
 * with group.reports.read whose appData catalog carries at least one category. Read
 * from the same appData.groupCategories the builder's picker unions, so a filter
 * seeded with the returned id resolves to its name chip on open-in-builder.
 */
export async function apiFirstReportCategory(
  api: APIRequestContext,
): Promise<{ groupId: string; categoryId: number; categoryName: string }> {
  const appData = (await (await api.get('/api/user/appData')).json()) as {
    groupPermissions?: Record<string, string[]>;
    groupCategories?: Record<string, { id?: number; name?: string }[]>;
  };
  const groupPermissions = appData.groupPermissions ?? {};
  const groupCategories = appData.groupCategories ?? {};
  for (const groupId of Object.keys(groupPermissions)) {
    if (!(groupPermissions[groupId] ?? []).includes('group.reports.read')) {
      continue;
    }
    // The lowest id is a starter category: the specs that mint and delete categories run alongside this one, and a
    // template filtering on a category that vanishes mid-test hydrates without its row.
    const category = (groupCategories[groupId] ?? [])
      .filter((c) => c.id != null && !!c.name)
      .sort((a, b) => a.id! - b.id!)[0];
    if (category) {
      return { groupId, categoryId: category.id!, categoryName: category.name! };
    }
  }
  throw new Error('no category in a group with group.reports.read for the caller');
}

/**
 * Creates a report template via the API and returns its id + name (requires
 * app.reports.create on the caller). The body is a complete, buildable
 * ReportRequestCommand — records mode over a group the caller can report on.
 */
export async function apiCreateReportTemplate(
  api: APIRequestContext,
  opts?: {
    name?: string;
    groupIds?: string[];
    formats?: string[];
    filter?: unknown;
    // The shape of the report itself. Defaulted to the records-mode config every
    // caller wanted before; override to store a grouped/aggregated template, e.g.
    // one grouped by a custom field's `custom_<id>` key.
    groupBy?: string[];
    detail?: { mode: 'records' | 'aggregate'; by?: string };
    columns?: unknown[];
  },
): Promise<{ id: number; name: string }> {
  api = retryOn503(api);
  const name = opts?.name ?? uniqueName('report-template');
  // Scope a real group the caller can report on, so generating over it isn't
  // group-gated out (the seeded admin's group ids are not necessarily [1]).
  const groupIds = opts?.groupIds ?? [await apiFirstReportGroupId(api)];
  const res = await api.post('/api/report/template', {
    data: {
      name,
      groupIds,
      period: { preset: 'this_month' },
      detail: opts?.detail ?? { mode: 'records' },
      columns: opts?.columns ?? [
        { kind: 'dimension', name: 'Name', label: 'Name', field: 'name' },
      ],
      formats: opts?.formats ?? ['csv'],
      ...(opts?.groupBy ? { groupBy: opts.groupBy } : {}),
      ...(opts?.filter ? { filter: opts.filter } : {}),
    },
  });
  if (!res.ok()) {
    throw new Error(
      `create report template failed: HTTP ${res.status()} ${await res.text()}`,
    );
  }
  const template = (await res.json()) as { id: number; name: string };
  return { id: template.id, name: template.name };
}

export interface UpsertRolePayload {
  name: string;
  scope: 'APP' | 'GROUP';
  permissions: string[];
  reportTemplateGrants?: { reportTemplateId: number; permissions: string[] }[];
  /**
   * Category/tag ids a GROUP role's members may see. This is the CEILING that a
   * member's individual assignment narrows within — the two intersect. Empty (or
   * omitted) means unrestricted, matching the backend's grant convention.
   */
  categoryGrants?: number[];
  tagGrants?: number[];
  /**
   * When true, a member holding this role with NO individual assignment sees
   * nothing at all rather than falling back to the role's set — so forgetting to
   * assign a new member fails closed.
   */
  requiresIndividualCategoryGrants?: boolean;
  requiresIndividualTagGrants?: boolean;
  /** GROUP roles only: members must keep a comment / an image on receipts. */
  requireReceiptComment?: boolean;
  requireReceiptImage?: boolean;
}

/**
 * Creates a role via the admin API and returns its id. Unlike createRole (which
 * drives the UI), this is for provisioning a role whose exact permission set /
 * report-template matrix a test needs precisely — e.g. a group role granting
 * group.reports.read plus a specific reportTemplateGrants matrix.
 */
export async function apiCreateRole(
  api: APIRequestContext,
  opts: UpsertRolePayload,
): Promise<{ id: number }> {
  api = retryOn503(api);
  const res = await api.post('/api/role', {
    data: { description: '', ...opts },
  });
  if (!res.ok()) {
    throw new Error(`create role failed: HTTP ${res.status()} ${await res.text()}`);
  }
  const role = (await res.json()) as { id: number };
  return { id: role.id };
}

/**
 * Updates the role [id] in place (scope carried in the body). Used to set a group
 * role's reportTemplateGrants matrix AFTER the templates it references exist (the
 * matrix references template ids, which need the group, which needs the role — so
 * the role is created first and its matrix filled here).
 */
export async function apiUpdateRole(
  api: APIRequestContext,
  id: number,
  opts: UpsertRolePayload,
): Promise<void> {
  api = retryOn503(api);
  const res = await api.put(`/api/role/${id}`, {
    data: { description: '', ...opts },
  });
  if (!res.ok()) {
    throw new Error(`update role failed: HTTP ${res.status()} ${await res.text()}`);
  }
}

/** Deletes the report template [id] (requires app.reports.delete on the caller). */
export async function apiDeleteReportTemplateById(
  api: APIRequestContext,
  id: number | string,
): Promise<void> {
  await api.delete(`/api/report/template/${id}`);
}

// --- Categories / tags -------------------------------------------------------
//
// Categories and tags are GLOBAL with a uniquely-indexed name, so every spec must
// mint uniqueName-suffixed ones and delete them in teardown; a leaked name makes
// the next run's create fail.

/** Creates a category and returns its id + name. */
export async function apiCreateCategory(
  api: APIRequestContext,
  name: string,
): Promise<{ id: number; name: string }> {
  api = retryOn503(api);
  const res = await api.post('/api/category', { data: { name, description: '' } });
  if (!res.ok()) {
    throw new Error(
      `create category failed: HTTP ${res.status()} ${await res.text()}`,
    );
  }
  const category = (await res.json()) as { id: number; name: string };
  return { id: category.id, name: category.name };
}

/** Creates a tag and returns its id + name. */
export async function apiCreateTag(
  api: APIRequestContext,
  name: string,
): Promise<{ id: number; name: string }> {
  api = retryOn503(api);
  const res = await api.post('/api/tag', { data: { name, description: '' } });
  if (!res.ok()) {
    throw new Error(`create tag failed: HTTP ${res.status()} ${await res.text()}`);
  }
  const tag = (await res.json()) as { id: number; name: string };
  return { id: tag.id, name: tag.name };
}

/**
 * Warns rather than throws on a failed delete.
 *
 * Every caller runs inside an `afterAll` whose body is wrapped in `try/catch {}`
 * so cleanup can never mask a test failure. Throwing here would be swallowed by
 * that catch AND abort the remaining deletes in the same block — leaking more
 * names than it reports. A warning keeps every delete running and still puts the
 * failure in the test output, which is what makes a leaked unique name (the thing
 * that breaks the next run's create) diagnosable.
 */
async function warnOnFailedDelete(
  api: APIRequestContext,
  path: string,
  what: string,
): Promise<void> {
  const res = await api.delete(path);
  if (!res.ok()) {
    console.warn(
      `e2e cleanup: failed to delete ${what} — HTTP ${res.status()} ${await res.text()}`,
    );
  }
}

export async function apiDeleteCategoryById(
  api: APIRequestContext,
  id: number,
): Promise<void> {
  await warnOnFailedDelete(api, `/api/category/${id}`, `category ${id}`);
}

export async function apiDeleteTagById(
  api: APIRequestContext,
  id: number,
): Promise<void> {
  await warnOnFailedDelete(api, `/api/tag/${id}`, `tag ${id}`);
}

// --- Group receipt settings ---------------------------------------------------

/**
 * Reads [groupId]'s current receipt settings and returns them as a PUT body.
 *
 * `PUT /group/{id}/groupReceiptSettings` is an UPSERT over the whole settings
 * object, so a partial body resets every non-pointer flag to false. This echoes
 * the boolean flags back unchanged; a caller spreads its own overrides on top.
 *
 * Only the booleans are echoed: the enum defaults (`quickScanDefaultPaidByType` /
 * `...Status`) are omitted because the backend keeps its stored value and rejects
 * an empty enum, which is also why paid-by and status stay shown+required here
 * (making either optional would need a configured default).
 *
 * pointer keys are deliberately absent: omitting a pointer key means
 * "leave unchanged", so a caller that does not set one cannot clobber it.
 *
 * Shared by every settings setter below so the key list exists once. A new
 * non-pointer flag added to the command has to be added here or it is silently
 * zeroed by every one of them.
 */
async function groupReceiptSettingsEcho(
  api: APIRequestContext,
  groupId: number | string,
  what: string,
): Promise<Record<string, unknown>> {
  const groupsRes = await api.get('/api/group/');
  if (!groupsRes.ok()) {
    throw new Error(
      `${what}: GET /api/group/ failed: HTTP ${groupsRes.status()} ${await groupsRes.text()}`,
    );
  }
  const groups = (await groupsRes.json()) as {
    id: number;
    groupReceiptSettings?: Record<string, unknown>;
  }[];
  const group = groups.find((g) => String(g.id) === String(groupId));
  if (!group) {
    throw new Error(`${what}: group ${groupId} not visible`);
  }

  const settings = group.groupReceiptSettings ?? {};
  const command: Record<string, unknown> = {};
  for (const key of [
    'hideImages', 'hideReceiptCategories', 'hideReceiptTags',
    'hideComments',
    'quickScanPaidByEnabled', 'quickScanPaidByRequired',
    'quickScanStatusEnabled', 'quickScanStatusRequired',
    'quickScanCategoriesEnabled', 'quickScanCategoriesRequired',
    'quickScanTagsEnabled', 'quickScanTagsRequired',
    'quickScanCommentEnabled', 'quickScanCommentRequired',
  ]) {
    command[key] = settings[key] ?? false;
  }

  return command;
}

async function putGroupReceiptSettings(
  api: APIRequestContext,
  groupId: number | string,
  command: Record<string, unknown>,
  what: string,
): Promise<void> {
  const res = await api.put(`/api/group/${groupId}/groupReceiptSettings`, {
    data: command,
  });
  if (!res.ok()) {
    throw new Error(`${what} failed: HTTP ${res.status()} ${await res.text()}`);
  }
}

// --- Per-member category/tag grants ------------------------------------------

/**
 * Replaces one group member's individual category/tag assignment, returning the
 * RAW response so a spec can assert the status (200 / 400 out-of-ceiling / 403
 * missing group.members.grants.update / 404 non-member) rather than only the
 * happy-path effect.
 *
 * [groupId]/[userId] go in the URL because that is what the endpoint authorizes
 * against; [body] may carry contradicting ids to prove the URL wins.
 */
export async function apiSetMemberGrants(
  api: APIRequestContext,
  groupId: number | string,
  userId: number,
  body: { categoryGrants?: number[]; tagGrants?: number[] } & Record<string, unknown>,
) {
  return api.put(`/api/group/${groupId}/member/${userId}/grants`, { data: body });
}

/**
 * The category/tag names the calling user can actually SEE in [groupId], read
 * from appData's per-group catalogs.
 *
 * This is deliberately the assertion surface for effective visibility: it is the
 * very array the desktop's receipt-form pickers render from, so it tests the real
 * delivery path rather than a parallel one. Names (not ids) so failures read
 * clearly.
 */
export async function apiMemberCatalog(
  api: APIRequestContext,
  groupId: number | string,
): Promise<{ categories: string[]; tags: string[] }> {
  const appData = (await (await api.get('/api/user/appData')).json()) as {
    groupCategories?: Record<string, { name?: string }[]>;
    groupTags?: Record<string, { name?: string }[]>;
  };
  const key = String(groupId);
  const names = (entries?: { name?: string }[]) =>
    (entries ?? []).map((e) => e.name ?? '').sort();

  return {
    categories: names(appData.groupCategories?.[key]),
    tags: names(appData.groupTags?.[key]),
  };
}

/** Replaces a group's whole member roster (the wholesale UpdateGroup path). */
export async function apiSetGroupRoster(
  api: APIRequestContext,
  groupId: number | string,
  opts: {
    name: string;
    members: { userId: number; groupRoleId: number }[];
  },
) {
  return api.put(`/api/group/${groupId}`, {
    data: {
      name: opts.name,
      status: 'ACTIVE',
      isAllGroup: false,
      groupMembers: opts.members.map((m) => ({
        userId: m.userId,
        groupId: Number(groupId),
        groupRoleId: m.groupRoleId,
      })),
    },
  });
}

/** Returns a group's members (including their individual grant ids). */
export async function apiGetGroupMembers(
  api: APIRequestContext,
  groupId: number | string,
): Promise<
  {
    userId: number;
    groupRoleId: number;
    categoryGrants?: number[] | null;
    tagGrants?: number[] | null;
  }[]
> {
  const group = (await (await api.get(`/api/group/${groupId}`)).json()) as {
    groupMembers: {
      userId: number;
      groupRoleId: number;
      categoryGrants?: number[] | null;
      tagGrants?: number[] | null;
    }[];
  };
  return group.groupMembers;
}

/**
 * Deletes the [scope] role named [name]. Only succeeds once it's unassigned, so
 * call after the user/group that referenced it is gone.
 */
export async function apiDeleteRoleByName(
  api: APIRequestContext,
  name: string,
  scope: 'APP' | 'GROUP',
): Promise<void> {
  const roles = (await (await api.get('/api/role')).json()) as {
    id: number;
    name: string;
    scope: string;
  }[];
  const role = roles.find((r) => r.name === name && r.scope === scope);
  if (role) {
    await api.delete(`/api/role/${role.id}?scope=${scope}`);
  }
}

/**
 * Creates a receipt-processing configuration pointed at an unreachable host, so
 * every AI call made through it fails.
 *
 * `isVisionModel` is set so the pipeline skips OCR and goes straight to the AI
 * call -- that keeps the failure fast and independent of whether Tesseract is
 * installed on the backend under test.
 */
export async function apiCreateUnreachableProcessingSettings(
  api: APIRequestContext,
  name: string,
): Promise<{ id: number }> {
  const res = await api.post('/api/receiptProcessingSettings/', {
    data: {
      name,
      description: 'e2e: forces a failed quick scan',
      aiType: 'OPEN_AI_CUSTOM',
      // Reserved for documentation examples, so it can never resolve.
      url: 'http://invalid.example:9/v1',
      key: 'e2e',
      model: 'e2e',
      isVisionModel: true,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `create receipt processing settings failed: HTTP ${res.status()} ${await res.text()}`,
    );
  }
  const settings = (await res.json()) as { id: number };

  return { id: settings.id };
}

/**
 * Overlays one field onto the live system settings. Re-reads first so a
 * concurrent change to an unrelated setting is not clobbered by a stale
 * snapshot -- the PUT is an upsert needing the full object.
 */
export async function apiPatchSystemSettings(
  api: APIRequestContext,
  patch: Record<string, unknown>,
): Promise<void> {
  const getResponse = await api.get('/api/systemSettings');
  if (!getResponse.ok()) {
    throw new Error(`GET /api/systemSettings failed: HTTP ${getResponse.status()}`);
  }
  const current = await getResponse.json();

  const putResponse = await api.put('/api/systemSettings', {
    data: { ...current, ...patch },
  });
  if (!putResponse.ok()) {
    throw new Error(
      `PUT /api/systemSettings failed: HTTP ${putResponse.status()} ${await putResponse.text()}`,
    );
  }
}

/** Posts a quick scan of [file] for [groupId]. Fire-and-forget on the server. */
export async function apiQuickScan(
  api: APIRequestContext,
  groupId: number,
  paidByUserId: number,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const res = await api.post('/api/receipt/quickScan', {
    multipart: {
      files: file,
      groupIds: String(groupId),
      paidByUserIds: String(paidByUserId),
      statuses: 'OPEN',
      categoryIds: '',
      tagIds: '',
      comments: '',
    },
  });
  if (!res.ok()) {
    throw new Error(
      `quick scan failed: HTTP ${res.status()} ${await res.text()}`,
    );
  }
}

/**
 * Polls the activity feed until a QUICK_SCAN row for [groupId] is FAILED and
 * still carries its upload, then returns it.
 */
export async function apiWaitForFailedQuickScan(
  api: APIRequestContext,
  groupId: number,
  timeoutMs = 60_000,
): Promise<{ id: number; hasSourceFile: boolean }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await api.post('/api/systemTask/getPagedActivities', {
      data: {
        groupIds: [groupId],
        orderBy: 'started_at',
        sortDirection: 'desc',
        page: 1,
        pageSize: 25,
      },
    });
    if (res.ok()) {
      const paged = (await res.json()) as {
        data: { id: number; type: string; status: string; hasSourceFile: boolean }[];
      };
      const failed = paged.data.find(
        (activity) => activity.type === 'QUICK_SCAN' && activity.status === 'FAILED',
      );
      if (failed?.hasSourceFile) {
        return failed;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`no failed quick scan with a source file appeared for group ${groupId}`);
}

/** Deletes a receipt-processing configuration. */
export async function apiDeleteProcessingSettings(
  api: APIRequestContext,
  settingsId: number,
): Promise<void> {
  await api.delete(`/api/receiptProcessingSettings/${settingsId}`);
}

/**
 * Reads a page of system tasks through the same endpoint the table uses, so a
 * spec can assert the server actually narrowed rather than only that the UI
 * rendered. [filter] is a `SystemTaskPagedRequestFilter`.
 */
export async function apiPagedSystemTasks(
  api: APIRequestContext,
  filter: Record<string, unknown> = {},
): Promise<{ totalCount: number; data: Record<string, any>[] }> {
  const res = await api.post('/api/systemTask/getPagedSystemTasks', {
    data: {
      page: 1,
      pageSize: 100,
      orderBy: 'started_at',
      sortDirection: 'desc',
      filter,
    },
  });
  if (!res.ok()) {
    throw new Error(`paged system tasks failed: HTTP ${res.status()}`);
  }

  const body = await res.json();
  return { totalCount: body.totalCount, data: body.data ?? [] };
}
