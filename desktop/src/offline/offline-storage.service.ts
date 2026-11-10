import { Injectable } from "@angular/core";

const DATABASE_NAME = "cartvibe-offline";
const STORE_NAME = "entries";

/**
 * What the app keeps on the device so it works without a connection: the shopping lists as last seen, the changes
 * waiting to be sent, and receipt photos waiting to be uploaded. It is the signed-in account's data: `clear()` runs
 * when a session ends.
 *
 * Values live in IndexedDB (they include photos, and `localStorage` holds strings only and a few megabytes). Where
 * the browser has no IndexedDB or refuses it (a private window, the unit-test DOM) the same calls work on memory,
 * so nothing here ever rejects: the app then simply forgets on reload, as it did before.
 */
@Injectable({ providedIn: "root" })
export class OfflineStorageService {
  private readonly memory = new Map<string, unknown>();

  private database?: Promise<IDBDatabase | undefined>;

  public async get<T>(key: string): Promise<T | undefined> {
    const database = await this.open();
    if (!database) {
      return this.memory.get(key) as T | undefined;
    }

    return this.run<T | undefined>(database, "readonly", (store) => store.get(key)).catch(() => undefined);
  }

  public async set(key: string, value: unknown): Promise<void> {
    const database = await this.open();
    if (!database) {
      this.memory.set(key, value);
      return;
    }

    await this.run(database, "readwrite", (store) => store.put(value, key)).catch(() => undefined);
  }

  public async remove(key: string): Promise<void> {
    const database = await this.open();
    if (!database) {
      this.memory.delete(key);
      return;
    }

    await this.run(database, "readwrite", (store) => store.delete(key)).catch(() => undefined);
  }

  /** The keys that start with `prefix`, in key order. */
  public async keys(prefix: string): Promise<string[]> {
    const database = await this.open();
    if (!database) {
      return [...this.memory.keys()].filter((key) => key.startsWith(prefix)).sort();
    }

    const keys = await this.run<IDBValidKey[]>(database, "readonly", (store) => store.getAllKeys()).catch(
      (): IDBValidKey[] => []
    );
    return keys.filter((key): key is string => typeof key === "string" && key.startsWith(prefix));
  }

  /** Forgets everything: the account that signed out leaves nothing of its own on the device. */
  public async clear(): Promise<void> {
    this.memory.clear();
    const database = await this.open();
    if (database) {
      await this.run(database, "readwrite", (store) => store.clear()).catch(() => undefined);
    }
  }

  private open(): Promise<IDBDatabase | undefined> {
    this.database ??= new Promise<IDBDatabase | undefined>((resolve) => {
      try {
        if (typeof indexedDB === "undefined") {
          resolve(undefined);
          return;
        }

        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
        request.onblocked = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });

    return this.database;
  }

  private run<T>(
    database: IDBDatabase,
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      try {
        const request = work(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }
}
