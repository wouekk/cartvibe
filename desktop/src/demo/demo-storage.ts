/**
 * The demo shares an origin (`wouekk.github.io`) with every other GitHub Pages site of the owner, so it keeps its own
 * namespace: every `localStorage` and `sessionStorage` key the app reads or writes carries this prefix. The patch is
 * installed before the app starts, which also covers the NGXS storage plugin and the theme and language caches.
 * (`key()` and `length` are left alone: the app does not enumerate storage.)
 */
export const DEMO_STORAGE_PREFIX = "cartvibe-demo:";

/** Keys a Reset keeps: the look is the visitor's own taste, not demo data. */
const KEPT_ON_RESET = ["rw_theme_mode", "rw_theme_palette"];

const original =
  typeof Storage === "undefined"
    ? undefined
    : {
        getItem: Storage.prototype.getItem,
        setItem: Storage.prototype.setItem,
        removeItem: Storage.prototype.removeItem,
        key: Storage.prototype.key,
      };

let installed = false;

export function installDemoStorage(): void {
  if (installed || !original) {
    return;
  }
  installed = true;

  const proto = Storage.prototype;
  proto.getItem = function (this: Storage, key: string) {
    return original.getItem.call(this, DEMO_STORAGE_PREFIX + key);
  };
  proto.setItem = function (this: Storage, key: string, value: string) {
    original.setItem.call(this, DEMO_STORAGE_PREFIX + key, value);
  };
  proto.removeItem = function (this: Storage, key: string) {
    original.removeItem.call(this, DEMO_STORAGE_PREFIX + key);
  };
  // `clear()` must never wipe the owner's other sites' keys.
  proto.clear = function (this: Storage) {
    clearDemoStorage(this, []);
  };
}

/** Removes the demo's own keys from a storage (never anyone else's), except the ones in `keep` (unprefixed names). */
export function clearDemoStorage(storage: Storage, keep: string[] = KEPT_ON_RESET): void {
  if (!original) {
    return;
  }

  const kept = new Set(keep.map((key) => DEMO_STORAGE_PREFIX + key));
  const doomed: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = original.key.call(storage, index);
    if (key?.startsWith(DEMO_STORAGE_PREFIX) && !kept.has(key)) {
      doomed.push(key);
    }
  }
  doomed.forEach((key) => original.removeItem.call(storage, key));
}
