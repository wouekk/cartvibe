import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
  request as pwRequest,
} from '@playwright/test';
import { creds, type Role } from './auth';

// Shared provisioning for the e2e specs. Users and groups are created and torn down through the admin API, on the
// four fixed roles (Admin and User in the app, Owner and Member in a household): nothing creates a role.
// `DELETE /api/user/{id}` hard-deletes and deleting a group takes its memberships with it, so the API tears down
// cleanly.

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

/**
 * Creates a user on one of the two app roles through the admin API (the Add User dialog's role select has no
 * accessible name): 'Legacy Admin' is the row the app shows as Admin, 'User' is everyone else.
 */
export async function createUserWithRole(
  _page: Page | null,
  opts: { username: string; password: string; role: 'Legacy Admin' | 'User' },
): Promise<void> {
  await withAdminApi(async (api) => {
    const roles = await apiListRoles(api);
    const role = roles.find((r) => r.name === opts.role && r.scope === 'APP');
    if (!role) {
      throw new Error(`app role ${opts.role} not found`);
    }
    const res = await api.post('/api/user', {
      data: {
        username: opts.username,
        password: opts.password,
        displayName: opts.username,
        isDummyUser: false,
        appRoleId: role.id,
      },
    });
    if (!res.ok()) {
      throw new Error(`create user ${opts.username} failed: HTTP ${res.status()} ${await res.text()}`);
    }
    // A new account is greeted by a welcome dialog that covers the page (UserPreferences.onboardingPending), and
    // only the account itself can switch it off. Both roles hold app.user-preferences.*.
    await withApiAsCreds(opts.username, opts.password, async (userApi) => {
      const preferences = (await (await userApi.get('/api/userPreferences')).json()) as Record<string, unknown>;
      await userApi.put('/api/userPreferences', { data: { ...preferences, onboardingPending: false } });
    });
  });
}

/**
 * Creates a group owned by the admin with [opts.memberDisplayName] added on one of the two household roles
 * ('Legacy Owner' is the row the app shows as Admin, 'Member' is everyone else), and returns the new group's id.
 */
export async function createGroupWithMember(
  _page: Page | null,
  opts: { groupName: string; memberDisplayName: string; roleName: 'Legacy Owner' | 'Member' },
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
 * POST /api/login, retried with backoff while nginx's login limit answers 429 (30 a minute; parallel workers can
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
    if (res.status() !== 429 && res.status() !== 503) {
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
 * 429 beyond that (503 before 2026-11). A provisioning call that hits it is repeated after a short wait, so a burst of setup calls never
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
          if (res.status() !== 429 && res.status() !== 503) {
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

// --- Household members -------------------------------------------------------

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

/** Returns a group's members. */
export async function apiGetGroupMembers(
  api: APIRequestContext,
  groupId: number | string,
): Promise<{ userId: number; groupRoleId: number }[]> {
  const group = (await (await api.get(`/api/group/${groupId}`)).json()) as {
    groupMembers: { userId: number; groupRoleId: number }[];
  };
  return group.groupMembers;
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
