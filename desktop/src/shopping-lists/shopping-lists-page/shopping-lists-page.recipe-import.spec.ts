import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import type { Mock } from "vitest";
import { AppDialog } from "../../dialog/app-dialog";
import { Permission, ShoppingList, ShoppingListItem, ShoppingListService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SnackbarService } from "../../services";
import { ShoppingListStreamService } from "../../services/shopping-list-stream.service";
import { ShoppingListSyncService } from "../../services/shopping-list-sync.service";
import { AuthState } from "../../store/auth.state";
import { GroupState } from "../../store/group.state";
import { ShoppingListState } from "../../store/shopping-list.state";
import { LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { RecipeImportDialogComponent } from "../recipe-import-dialog/recipe-import-dialog.component";
import { ShoppingListsPageComponent } from "./shopping-lists-page.component";

const item = (id: number, listId: number): ShoppingListItem =>
  ({ id, shoppingListId: listId, name: `item-${id}`, isChecked: false }) as ShoppingListItem;

const list = (id: number, name: string, createdAt: string): ShoppingList =>
  ({ id, groupId: 1, name, createdAt, items: [item(id * 10, id)] }) as ShoppingList;

const lists = (): ShoppingList[] => [list(1, "Lidl", "2026-10-20T08:00:00Z"), list(2, "Aldi", "2026-10-22T08:00:00Z")];

const EDITOR = [Permission.GroupShoppingListsRead, Permission.GroupShoppingListsCreate, Permission.GroupShoppingListsUpdate];
const VIEWER = [Permission.GroupShoppingListsRead];

describe("ShoppingListsPageComponent recipe import", () => {
  let fixture: ComponentFixture<ShoppingListsPageComponent>;
  let open: Mock;
  let navigate: Mock;
  let snackbar: { hint: Mock; error: Mock; success: Mock };
  let service: { getShoppingListsForGroup: Mock };

  const render = async (options: { query?: Record<string, string>; permissions?: string[]; lists?: ShoppingList[] } = {}) => {
    open = vi.fn().mockReturnValue({ componentInstance: {}, afterClosed: () => of(undefined) });
    navigate = vi.fn();
    snackbar = { hint: vi.fn(), error: vi.fn(), success: vi.fn() };
    service = { getShoppingListsForGroup: vi.fn().mockReturnValue(of(options.lists ?? lists())) };

    await TestBed.configureTestingModule({
      declarations: [ShoppingListsPageComponent],
      imports: [NgxsModule.forRoot([ShoppingListState, AuthState, GroupState]), PipesModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(new Map([["groupId", "1"]]) as never),
            snapshot: { queryParamMap: convertToParamMap(options.query ?? {}) },
          },
        },
        { provide: Router, useValue: { navigate } },
        { provide: ShoppingListService, useValue: service },
        { provide: ShoppingListStreamService, useValue: { connect: vi.fn(), disconnect: vi.fn(), status: signal("live") } },
        { provide: ShoppingListSyncService, useValue: { stalled: signal(false), drained: vi.fn().mockResolvedValue(true) } },
        { provide: SnackbarService, useValue: snackbar },
        { provide: AppDialog, useValue: { open } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    const store = TestBed.inject(Store);
    store.reset({
      ...store.snapshot(),
      auth: { ...store.snapshot().auth, groupPermissions: { 1: options.permissions ?? EDITOR } },
    });
    store.dispatch(new LoadShoppingLists(1));

    fixture = TestBed.createComponent(ShoppingListsPageComponent);
    await fixture.whenStable();
  };

  afterEach(() => TestBed.resetTestingModule());

  const button = (): HTMLButtonElement | null =>
    fixture.nativeElement.querySelector('[data-testid="shopping-list-import-recipe"]');

  describe("the toolbar button", () => {
    it("is offered to someone who can change the list", async () => {
      await render();

      expect(button()).not.toBeNull();
      expect(button()!.textContent).toContain("Import recipe");
    });

    it("is not offered to someone who can only read", async () => {
      await render({ permissions: VIEWER });

      expect(button()).toBeNull();
    });

    it("is not offered where there is no list to add to", async () => {
      await render({ lists: [] });

      expect(button()).toBeNull();
    });

    it("opens the dialog on the open list, with the lists still being shopped", async () => {
      await render();

      button()!.click();

      expect(open).toHaveBeenCalledTimes(1);
      const [component, config] = open.mock.calls[0];
      expect(component).toBe(RecipeImportDialogComponent);
      expect(config.data.groupId).toBe(1);
      expect(config.data.listId).toBe(2); // the newest list is the one open
      expect(config.data.lists.map((candidate: ShoppingList) => candidate.id)).toEqual([2, 1]);
      expect(config.data.askForList).toBeUndefined();
      expect(config.data.url).toBeUndefined();
    });
  });

  describe("a recipe shared from a phone", () => {
    it("opens the dialog with the link, asking which list, and clears the address", async () => {
      await render({ query: { recipeUrl: "https://example.com/pancakes", recipeTitle: "Pancakes" } });

      expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: {}, replaceUrl: true }));
      expect(open).toHaveBeenCalledTimes(1);
      expect(open.mock.calls[0][1].data).toMatchObject({
        groupId: 1,
        listId: 2,
        askForList: true,
        url: "https://example.com/pancakes",
      });
    });

    it("finds the link inside shared text, where Android puts it next to the page title", async () => {
      await render({ query: { recipeText: "Best pancakes ever https://example.com/pancakes." } });

      expect(open.mock.calls[0][1].data.url).toBe("https://example.com/pancakes");
      expect(open.mock.calls[0][1].data.text).toBeUndefined();
    });

    it("hands shared text without a link over as text", async () => {
      await render({ query: { recipeText: "  200 g flour\n2 eggs " } });

      expect(open.mock.calls[0][1].data).toMatchObject({ askForList: true, text: "200 g flour\n2 eggs" });
      expect(open.mock.calls[0][1].data.url).toBeUndefined();
    });

    it("says to make a list first when there is none", async () => {
      await render({ query: { recipeUrl: "https://example.com/x" }, lists: [] });

      expect(open).not.toHaveBeenCalled();
      expect(snackbar.hint).toHaveBeenCalledWith("Create a shopping list first, then share the recipe again.");
    });

    it("does not offer the import to someone who can only read", async () => {
      await render({ query: { recipeUrl: "https://example.com/x" }, permissions: VIEWER });

      expect(open).not.toHaveBeenCalled();
      expect(snackbar.hint).toHaveBeenCalledWith("You cannot add items to these lists.");
    });

    it("ignores an unrelated query", async () => {
      await render({ query: { something: "else" } });

      expect(open).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
