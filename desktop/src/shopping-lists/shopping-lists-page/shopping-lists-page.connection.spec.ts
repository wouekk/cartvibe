import { HttpErrorResponse, provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection, signal, WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of, throwError } from "rxjs";
import type { Mock } from "vitest";
import { AppDialog } from "../../dialog/app-dialog";
import { Permission, ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SnackbarService } from "../../services";
import { OnlineStatusService } from "../../services/online-status.service";
import { ShoppingListStreamService, ShoppingListStreamStatus } from "../../services/shopping-list-stream.service";
import { ShoppingListSyncService } from "../../services/shopping-list-sync.service";
import { AuthState } from "../../store/auth.state";
import { GroupState } from "../../store/group.state";
import { ShoppingListState } from "../../store/shopping-list.state";
import { QueueShoppingListChange } from "../../store/shopping-list.state.actions";
import { ShoppingListsPageComponent } from "./shopping-lists-page.component";

const milk = { id: 10, shoppingListId: 1, name: "Milk", unit: "", quantity: "", note: "", isChecked: false } as ShoppingListItem;

const lists = (): ShoppingList[] => [{ id: 1, groupId: 1, name: "Lidl", createdAt: "2026-10-20T08:00:00Z", items: [milk] }];

describe("ShoppingListsPageComponent: what it says about the connection", () => {
  let fixture: ComponentFixture<ShoppingListsPageComponent>;
  let store: Store;
  let getShoppingListsForGroup: Mock;
  let status: WritableSignal<ShoppingListStreamStatus>;
  let online: WritableSignal<boolean>;
  let stalled: WritableSignal<boolean>;
  let drained: Mock;
  let setShoppingListChecked: Mock;
  let snackbarError: Mock;

  const testId = (id: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const text = (id: string): string => (testId(id)?.textContent ?? "").replace(/\s+/g, " ").trim();

  const create = async () => {
    store.reset({
      ...store.snapshot(),
      auth: { ...store.snapshot().auth, groupPermissions: { 1: [Permission.GroupShoppingListsUpdate] } },
    });
    fixture = TestBed.createComponent(ShoppingListsPageComponent);
    await fixture.whenStable();
  };

  const crossOffMilk = async () => {
    store.dispatch(new QueueShoppingListChange({ kind: "toggle", opId: "t", groupId: 1, listId: 1, itemId: 10, isChecked: true }));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    getShoppingListsForGroup = vi.fn().mockReturnValue(of(lists()));
    status = signal<ShoppingListStreamStatus>("connecting");
    online = signal(true);
    stalled = signal(false);
    drained = vi.fn().mockResolvedValue(true);
    setShoppingListChecked = vi.fn().mockImplementation(() => of({ ...lists()[0], items: [{ ...milk, isChecked: true }] }));
    snackbarError = vi.fn();

    await TestBed.configureTestingModule({
      declarations: [ShoppingListsPageComponent],
      imports: [NgxsModule.forRoot([ShoppingListState, AuthState, GroupState]), PipesModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(new Map([["groupId", "1"]]) as any), snapshot: undefined } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ShoppingListService, useValue: { getShoppingListsForGroup, setShoppingListChecked } },
        { provide: ShoppingListStreamService, useValue: { connect: vi.fn(), disconnect: vi.fn(), status } },
        { provide: ShoppingListSyncService, useValue: { stalled, drained } },
        { provide: OnlineStatusService, useValue: { online } },
        {
          provide: SnackbarService,
          useValue: { error: snackbarError, success: vi.fn(), hint: vi.fn(), successFromTemplate: vi.fn().mockReturnValue({ dismiss: vi.fn() }) },
        },
        { provide: AppDialog, useValue: { open: vi.fn() } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    store = TestBed.inject(Store);
  });

  it("says nothing while the first connection is being made", async () => {
    await create();

    expect(testId("shopping-list-connection")).toBeNull();
    expect(testId("shopping-list-offline")).toBeNull();
  });

  it("says Live while changes travel, with no notice", async () => {
    await create();
    status.set("live");
    await fixture.whenStable();

    expect(text("shopping-list-connection-label")).toBe("Live");
    expect(testId("shopping-list-pending-count")).toBeNull();
    expect(testId("shopping-list-connection")?.getAttribute("data-state")).toBe("live");
    expect(testId("shopping-list-offline")).toBeNull();
  });

  it("counts what is on its way while live", async () => {
    await create();
    status.set("live");
    await crossOffMilk();

    expect([text("shopping-list-connection-label"), testId("shopping-list-pending-count")?.getAttribute("title")]).toEqual(["Live", "Sending: 1"]);
  });

  it("says Reconnecting when the stream was lost but the browser still reports a network", async () => {
    await create();
    status.set("reconnecting");
    await fixture.whenStable();

    expect(text("shopping-list-connection-label")).toBe("Reconnecting");
    // Nothing of this device's is at stake yet, so no notice.
    expect(testId("shopping-list-offline")).toBeNull();

    await crossOffMilk();

    expect([text("shopping-list-connection-label"), testId("shopping-list-pending-count")?.getAttribute("title")]).toEqual(["Reconnecting", "Waiting to be sent: 1"]);
    expect(text("shopping-list-offline")).toContain("kept on this device");
  });

  // A phone that walks out of signal leaves the stream "open" for a while. A change that just failed to get
  // through is first-hand knowledge, so the page stops saying Live at once.
  it("does not say Live over a change that could not be sent, although the stream still looks open", async () => {
    await create();
    status.set("live");
    await crossOffMilk();
    stalled.set(true);
    await fixture.whenStable();

    expect([text("shopping-list-connection-label"), testId("shopping-list-pending-count")?.getAttribute("title")]).toEqual(["Reconnecting", "Waiting to be sent: 1"]);
    expect(text("shopping-list-offline")).toContain("kept on this device");
  });

  it("says Offline, how many changes wait, and that they are kept, when the browser has no network", async () => {
    await create();
    status.set("reconnecting");
    online.set(false);
    await crossOffMilk();

    expect([text("shopping-list-connection-label"), testId("shopping-list-pending-count")?.getAttribute("title")]).toEqual(["Offline", "Waiting to be sent: 1"]);
    expect(testId("shopping-list-connection")?.getAttribute("data-state")).toBe("offline");
    expect(text("shopping-list-offline")).toContain("sent when the connection is back");
  });

  describe("a whole-list action while changes wait", () => {
    const settled = () => new Promise<void>((resolve) => setTimeout(resolve));

    // "Mark as complete" acts on the list as the server has it, and its Undo needs the server's item ids.
    it("sends the waiting changes first, then completes the list", async () => {
      await create();
      status.set("live");
      store.dispatch(new QueueShoppingListChange({ kind: "toggle", opId: "t", groupId: 1, listId: 1, itemId: 10, isChecked: false }));
      await fixture.whenStable();

      fixture.componentInstance.completeList(fixture.componentInstance.selectedList()!);
      expect(setShoppingListChecked).not.toHaveBeenCalled();
      expect(fixture.componentInstance.completing()).toBe(true);

      // The queue goes out (the sync service's job): nothing waits any more.
      store.reset({ ...store.snapshot(), shoppingLists: { ...store.snapshot().shoppingLists, pending: [] } });
      await settled();

      expect(drained).toHaveBeenCalledTimes(1);
      expect(setShoppingListChecked).toHaveBeenCalledWith(1, { isChecked: true, itemIds: undefined });
    });

    it("does nothing, and says why, when they cannot be sent", async () => {
      drained.mockResolvedValue(false);
      await create();
      await crossOffMilk();
      store.dispatch(new QueueShoppingListChange({ kind: "toggle", opId: "u", groupId: 1, listId: 1, itemId: 10, isChecked: false }));
      await fixture.whenStable();

      fixture.componentInstance.completeList(fixture.componentInstance.selectedList()!);
      await settled();

      expect(setShoppingListChecked).not.toHaveBeenCalled();
      expect(snackbarError).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.completing()).toBe(false);
    });
  });

  it("explains an empty page when there is neither a connection nor a copy on the device", async () => {
    getShoppingListsForGroup.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    await create();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    expect(testId("shopping-list-unavailable")).not.toBeNull();
    expect(testId("shopping-list-none")).toBeNull();
  });
});
