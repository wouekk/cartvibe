import { HttpErrorResponse, provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { of, Subject, throwError } from "rxjs";
import type { Mock } from "vitest";
import { QUIET_ERRORS } from "../interceptors/http-interceptor";
import { OfflineStorageService } from "../offline/offline-storage.service";
import { ShoppingList, ShoppingListItem, ShoppingListService } from "../open-api";
import { PendingAdd, PendingChange, PendingToggle } from "../shopping-lists/shopping-list-pending";
import { AuthStore } from "../store/auth.store";
import { CachedShoppingLists, shoppingListsCacheKey } from "../store/shopping-list.store";
import { ShoppingListStore } from "../store/shopping-list.store";
import { ShoppingListStreamService, ShoppingListStreamStatus } from "./shopping-list-stream.service";
import { SHOPPING_LIST_OUTBOX_KEY, ShoppingListSyncService } from "./shopping-list-sync.service";
import { SnackbarService } from "./snackbar.service";
import { TokenRefreshService } from "./token-refresh.service";

const item = (id: number, overrides: Partial<ShoppingListItem> = {}): ShoppingListItem =>
  ({ id, shoppingListId: 1, name: `item-${id}`, unit: "", quantity: "", note: "", isChecked: false, ...overrides }) as ShoppingListItem;

const supermarket = (): ShoppingList => ({ id: 1, groupId: 1, name: "Supermarket", items: [item(1), item(2)] });

const breadAdd: PendingAdd = {
  kind: "add",
  opId: "a",
  groupId: 1,
  listId: 1,
  clientId: "a",
  item: item(-1, { clientId: "a", name: "Bread" }),
  command: { name: "Bread", unit: "", quantity: "", note: "" },
};

const crossOff = (opId: string, itemId: number, overrides: Partial<PendingToggle> = {}): PendingToggle => ({
  kind: "toggle",
  opId,
  groupId: 1,
  listId: 1,
  itemId,
  isChecked: true,
  ...overrides,
});

const offline = () => throwError(() => new HttpErrorResponse({ status: 0 }));

/** Lets promises chained on the storage and on a send settle. */
const settled = async () => {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise<void>((resolve) => setTimeout(resolve));
  }
};

describe("ShoppingListSyncService", () => {
  let storage: OfflineStorageService;
  let api: Record<"getShoppingListsForGroup" | "addShoppingListItem" | "setShoppingListItemChecked", Mock>;
  let snackbar: { error: Mock };
  let ensureFreshToken: Mock;
  let streamStatus: ReturnType<typeof signal<ShoppingListStreamStatus>>;

  beforeEach(() => {
    api = {
      getShoppingListsForGroup: vi.fn().mockImplementation(() => of([supermarket()])),
      addShoppingListItem: vi.fn(),
      setShoppingListItemChecked: vi.fn(),
    };
    snackbar = { error: vi.fn() };
    ensureFreshToken = vi.fn().mockResolvedValue(true);
    streamStatus = signal<ShoppingListStreamStatus>("idle");

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ShoppingListService, useValue: api },
        { provide: SnackbarService, useValue: snackbar },
        { provide: TokenRefreshService, useValue: { ensureFreshToken } },
        { provide: ShoppingListStreamService, useValue: { status: streamStatus } },
      ],
    });

    storage = TestBed.inject(OfflineStorageService);
    // A session: nothing is sent, or put back, for a signed-out browser.
    TestBed.inject(AuthStore).setAuthState({ userId: 7, exp: Math.floor(Date.now() / 1000) + 600 } as never);
  });

  afterEach(() => {
    TestBed.inject(ShoppingListSyncService).ngOnDestroy();
    vi.useRealTimers();
  });

  const start = async (): Promise<ShoppingListSyncService> => {
    const service = TestBed.inject(ShoppingListSyncService);
    await service.ready;
    TestBed.inject(ShoppingListStore).load(1);
    await settled();
    return service;
  };

  const pending = (): PendingChange[] => TestBed.inject(ShoppingListStore).pending();

  it("sends a queued add with its client id, quietly, and puts the server's item in its place", async () => {
    await start();
    api.addShoppingListItem.mockReturnValue(of(item(40, { clientId: "a", name: "Bread" })));

    TestBed.inject(ShoppingListStore).queueChange(breadAdd);
    await settled();

    expect(api.addShoppingListItem).toHaveBeenCalledTimes(1);
    const [listId, command, observe, , options] = api.addShoppingListItem.mock.calls[0];
    expect(listId).toBe(1);
    expect(command).toEqual({ name: "Bread", unit: "", quantity: "", note: "", clientId: "a" });
    expect(observe).toBe("body");
    // The interceptor stays silent: a failure here is retried or reported by this service.
    expect(options.context.get(QUIET_ERRORS)).toBe(true);

    expect(pending()).toEqual([]);
    expect(TestBed.inject(ShoppingListStore).lists()[0].items.map((row) => row.id)).toEqual([1, 2, 40]);
  });

  it("sends changes one at a time, in the order they were made", async () => {
    await start();
    const addAnswer = new Subject<ShoppingListItem>();
    api.addShoppingListItem.mockReturnValue(addAnswer);
    api.setShoppingListItemChecked.mockImplementation((id: number) => of(item(id, { isChecked: true })));

    TestBed.inject(ShoppingListStore).queueChange(breadAdd);
    TestBed.inject(ShoppingListStore).queueChange(crossOff("t", -1, { clientId: "a" }));
    await settled();

    // The cross-off waits for the add: its item has no id on the server yet.
    expect(api.setShoppingListItemChecked).not.toHaveBeenCalled();

    addAnswer.next(item(40, { clientId: "a", name: "Bread" }));
    addAnswer.complete();
    await settled();

    expect(api.setShoppingListItemChecked.mock.calls[0].slice(0, 2)).toEqual([40, { isChecked: true }]);
    expect(pending()).toEqual([]);
    expect(TestBed.inject(ShoppingListStore).checkedItems().map((row) => row.id)).toEqual([40]);
  });

  it("keeps the queue when the server cannot be reached, and sends it when the stream comes up", async () => {
    await start();
    api.setShoppingListItemChecked.mockImplementation(offline);

    TestBed.inject(ShoppingListStore).queueChange(crossOff("t", 2));
    await settled();

    expect(pending().map((change) => change.opId)).toEqual(["t"]);
    // Still shown as crossed off, with no toast: nothing failed, it only waits.
    expect(TestBed.inject(ShoppingListStore).checkedItems().map((row) => row.id)).toEqual([2]);
    expect(snackbar.error).not.toHaveBeenCalled();
    // And the page is told the server is out of reach, whatever the stream still believes.
    expect(TestBed.inject(ShoppingListSyncService).stalled()).toBe(true);

    api.setShoppingListItemChecked.mockImplementation((id: number) => of(item(id, { isChecked: true })));
    streamStatus.set("live");
    TestBed.tick();
    await settled();

    expect(pending()).toEqual([]);
    expect(TestBed.inject(ShoppingListSyncService).stalled()).toBe(false);
  });

  it.each([500, 502, 503, 429, 408])("treats a %s as a reason to wait, not as a refusal", async (status) => {
    await start();
    api.setShoppingListItemChecked.mockImplementation(() => throwError(() => new HttpErrorResponse({ status })));

    TestBed.inject(ShoppingListStore).queueChange(crossOff("t", 2));
    await settled();

    expect(pending().map((change) => change.opId)).toEqual(["t"]);
  });

  it("tries again by itself after a while", async () => {
    await start();
    vi.useFakeTimers();
    api.setShoppingListItemChecked.mockImplementation(offline);
    TestBed.inject(ShoppingListStore).queueChange(crossOff("t", 2));
    await vi.advanceTimersByTimeAsync(100);
    expect(api.setShoppingListItemChecked).toHaveBeenCalledTimes(1);

    api.setShoppingListItemChecked.mockImplementation((id: number) => of(item(id, { isChecked: true })));
    await vi.advanceTimersByTimeAsync(2500);

    expect(api.setShoppingListItemChecked).toHaveBeenCalledTimes(2);
    expect(pending()).toEqual([]);
  });

  it("drops an add the server refuses, says which item, and reads the lists again", async () => {
    await start();
    api.addShoppingListItem.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 403 })));
    api.getShoppingListsForGroup.mockClear();

    TestBed.inject(ShoppingListStore).queueChange(breadAdd);
    TestBed.inject(ShoppingListStore).queueChange(crossOff("t", -1, { clientId: "a" }));
    await settled();

    expect(pending()).toEqual([]);
    expect(TestBed.inject(ShoppingListStore).lists()[0].items.map((row) => row.name)).toEqual(["item-1", "item-2"]);
    expect(snackbar.error).toHaveBeenCalledTimes(1);
    expect(snackbar.error.mock.calls[0][0]).toContain("Bread");
    expect(api.getShoppingListsForGroup).toHaveBeenCalledWith(1);
    expect(api.setShoppingListItemChecked).not.toHaveBeenCalled();
  });

  it("drops a cross-off for an item that is gone without a word", async () => {
    await start();
    api.setShoppingListItemChecked.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 403 })));

    TestBed.inject(ShoppingListStore).queueChange(crossOff("t", 2));
    await settled();

    expect(pending()).toEqual([]);
    expect(snackbar.error).not.toHaveBeenCalled();
    // The reread put the item back as the server has it.
    expect(TestBed.inject(ShoppingListStore).checkedItems()).toEqual([]);
  });

  describe("drained()", () => {
    it("is true at once when nothing waits", async () => {
      const service = await start();

      expect(await service.drained()).toBe(true);
      expect(api.setShoppingListItemChecked).not.toHaveBeenCalled();
    });

    it("waits for the send under way before answering", async () => {
      const service = await start();
      const answer = new Subject<ShoppingListItem>();
      api.setShoppingListItemChecked.mockReturnValue(answer);
      TestBed.inject(ShoppingListStore).queueChange(crossOff("t", 2));
      await settled();

      let result: boolean | undefined;
      void service.drained().then((value) => (result = value));
      await settled();
      expect(result).toBeUndefined();

      answer.next(item(2, { isChecked: true }));
      answer.complete();
      await settled();

      expect(result).toBe(true);
    });

    it("is false when the server cannot be reached", async () => {
      const service = await start();
      api.setShoppingListItemChecked.mockImplementation(offline);
      TestBed.inject(ShoppingListStore).queueChange(crossOff("t", 2));
      await settled();

      expect(await service.drained()).toBe(false);
      expect(pending().map((change) => change.opId)).toEqual(["t"]);
    });
  });

  it("renews the session before sending, and waits when that cannot be done", async () => {
    await start();
    ensureFreshToken.mockResolvedValue(false);
    api.setShoppingListItemChecked.mockImplementation((id: number) => of(item(id, { isChecked: true })));

    TestBed.inject(ShoppingListStore).queueChange(crossOff("t", 2));
    await settled();

    // An expired token would be refused, and a refusal drops the change: nothing goes out.
    expect(api.setShoppingListItemChecked).not.toHaveBeenCalled();
    expect(pending().map((change) => change.opId)).toEqual(["t"]);
  });

  it("keeps the queue and the open group's lists on the device", async () => {
    await start();
    api.setShoppingListItemChecked.mockImplementation(offline);

    TestBed.inject(ShoppingListStore).queueChange(crossOff("t", 2));
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(await storage.get<PendingChange[]>(SHOPPING_LIST_OUTBOX_KEY)).toEqual([expect.objectContaining({ opId: "t" })]);
    const copy = await storage.get<CachedShoppingLists>(shoppingListsCacheKey(1));
    expect(copy?.lists[0].items.find((row) => row.id === 2)?.isChecked).toBe(true);
    expect(copy?.selectedListId).toBe(1);
  });

  it("puts the queue of an earlier visit back and sends it", async () => {
    await storage.set(SHOPPING_LIST_OUTBOX_KEY, [crossOff("kept", 2)]);
    api.setShoppingListItemChecked.mockImplementation((id: number) => of(item(id, { isChecked: true })));

    await start();
    await settled();

    expect(api.setShoppingListItemChecked.mock.calls[0].slice(0, 2)).toEqual([2, { isChecked: true }]);
    expect(pending()).toEqual([]);
    expect(await storage.get(SHOPPING_LIST_OUTBOX_KEY)).toEqual([]);
  });

  it("leaves an earlier visit's queue alone when nobody is signed in", async () => {
    TestBed.inject(AuthStore).logout();
    await storage.set(SHOPPING_LIST_OUTBOX_KEY, [crossOff("kept", 2)]);

    const service = TestBed.inject(ShoppingListSyncService);
    await service.ready;
    await settled();

    expect(pending()).toEqual([]);
    expect(api.setShoppingListItemChecked).not.toHaveBeenCalled();
  });

  it("forgets everything on the device when the account signs out", async () => {
    await start();
    api.setShoppingListItemChecked.mockImplementation(offline);
    TestBed.inject(ShoppingListStore).queueChange(crossOff("t", 2));
    await settled();
    await storage.set("quick-scan:1", { files: [] });

    TestBed.inject(AuthStore).logout();
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(await storage.get(shoppingListsCacheKey(1))).toBeUndefined();
    expect(await storage.keys("quick-scan:")).toEqual([]);
    expect(await storage.get(SHOPPING_LIST_OUTBOX_KEY)).toEqual([]);
  });
});
