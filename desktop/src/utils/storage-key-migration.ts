/**
 * Browser keys renamed from the upstream `rw_` names (2026-11-04). Each is moved once, on first read, so a browser keeps
 * its theme and recent products. Delete this file once every household browser has opened a release that has it.
 */
export const LEGACY_STORAGE_KEYS: Readonly<Record<string, string>> = {
  "cartvibe.themeMode": "rw_theme_mode",
  "cartvibe.themePalette": "rw_theme_palette",
  "cartvibe.recentProducts": "rw_recent_products",
};

/**
 * Reads `key` from localStorage; when it is missing and the old name holds a value, moves that value to `key` first.
 * Storage can be missing or refuse access (private windows, blocked site data), so every call is guarded.
 */
export function readStorageKey(key: string): string | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      return null;
    }

    const current = storage.getItem(key);
    const legacyKey = LEGACY_STORAGE_KEYS[key];
    if (current !== null || !legacyKey) {
      return current;
    }

    const legacy = storage.getItem(legacyKey);
    if (legacy !== null) {
      storage.setItem(key, legacy);
      storage.removeItem(legacyKey);
    }
    return legacy;
  } catch {
    return null;
  }
}
