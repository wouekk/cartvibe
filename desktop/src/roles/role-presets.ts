import { marker } from "../i18n/marker";

// How the role preview names a role's permissions. The roles are fixed, so there are no presets to pick
// from any more: what is left of this file is the labelling the preview dialog needs.

/**
 * Derives the resource key for a permission: the full key minus its last
 * `.segment`. e.g. `app.users.create` -> `app.users`, `group.view` -> `group`.
 */
export function resourceKeyOf(permissionKey: string): string {
  const lastDot = permissionKey.lastIndexOf(".");
  return lastDot === -1 ? permissionKey : permissionKey.slice(0, lastDot);
}

/**
 * Maps a resource key to a Material icon name. Derived from the design's
 * resource icon set; falls back to `lock` for unknown resources.
 */
const RESOURCE_ICONS: Record<string, string> = {
  "app.users": "person",
  "app.groups": "group",
  "app.categories": "sell",
  "app.tags": "label",
  "app.receipt-processing-settings": "document_scanner",
  "app.system-settings": "settings",
  "app.system-tasks": "task_alt",
  group: "workspaces",
  "group.receipts": "receipt_long",
  "group.comments": "chat_bubble",
  "group.activities": "history",
};

export function iconForResource(resourceKey: string): string {
  return RESOURCE_ICONS[resourceKey] ?? "lock";
}

const RESOURCE_NAME_OVERRIDES: Record<string, string> = {
  "receipt-processing-settings": marker("Receipt Processing"),
  "system-settings": marker("System Settings"),
  "system-tasks": marker("System Tasks"),
};

/** Prettifies the last segment of a resource key into a friendly title. */
export function friendlyResourceName(resourceKey: string): string {
  const lastDot = resourceKey.lastIndexOf(".");
  const segment = lastDot === -1 ? resourceKey : resourceKey.slice(lastDot + 1);

  if (RESOURCE_NAME_OVERRIDES[segment]) {
    return RESOURCE_NAME_OVERRIDES[segment];
  }

  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Prettifies a permission key's action (last segment) into a label. */
export function friendlyActionLabel(permissionKey: string): string {
  const lastDot = permissionKey.lastIndexOf(".");
  const action = lastDot === -1 ? permissionKey : permissionKey.slice(lastDot + 1);
  const spaced = action.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
