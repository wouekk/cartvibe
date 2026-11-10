/**
 * What stays in `localStorage` when a session ends: the look and the language belong to the device and the person
 * holding it, not to the account that signed out. Everything else (the persisted store slices, recent products) is the
 * account's data and goes.
 */
export const KEPT_AFTER_SIGN_OUT = ["cartvibe.themeMode", "cartvibe.themePalette", "cartvibe.interfaceSize", "cartvibe.language"];

/** Removes the signed-out account's data from this browser and keeps the device's own choices. */
export function clearSessionStorage(): void {
  try {
    const kept = KEPT_AFTER_SIGN_OUT.map((key) => [key, localStorage.getItem(key)] as const);
    localStorage.clear();
    for (const [key, value] of kept) {
      if (value !== null) {
        localStorage.setItem(key, value);
      }
    }
  } catch {
    // Storage is blocked (a private window): there is nothing to clear.
  }
}

/**
 * Whether a failed token refresh means the server ended the session. Only its own refusal counts (401, or 403 from a
 * proxy in front of it). No connection (status 0), a restarting server (502, 503, 504) and any other error leave the
 * session alone: the refresh is tried again later.
 */
export function isSessionRefused(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
}
