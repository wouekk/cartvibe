import { HlmSidebarService } from "@spartan-ng/helm/sidebar";
import { OverlayContainer } from "@angular/cdk/overlay";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatMenuModule, MatMenuTrigger } from "@angular/material/menu";
import { MatSidenavModule } from "@angular/material/sidenav";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { By } from "@angular/platform-browser";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { LayoutState } from "src/store/layout.state";
import { ShoppingListState } from "src/store/shopping-list.state";
import { DirectivesModule } from "../../directives/directives.module";
import { ApiModule, FeatureConfig, Group, Permission } from "../../open-api";
import { ViewportService } from "../../services/viewport.service";
import { AuthState, FeatureConfigState, GroupState, SetFeatureConfig, SetSelectedGroupId } from "../../store";
import { SetAuthState, SetPermissions } from "../../store/auth.state.actions";
import { SetGroups } from "../../store/group.state.actions";
import { SidebarComponent } from "./sidebar.component";

describe("SidebarComponent", () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;
  let store: Store;
  let overlayContainer: OverlayContainer;
  const isHandset = signal(false);

  const login = () =>
    store.dispatch(
      new SetAuthState({ exp: Math.floor(Date.now() / 1000) + 3600 } as any)
    );

  const queryTestId = (id: string) =>
    fixture.debugElement.query(By.css(`[data-testid="${id}"]`));

  const sidebarText = (): string => fixture.nativeElement.textContent ?? "";

  /** Opens the menu whose trigger carries [testId] and returns the overlay's content. */
  const openMenu = async (testId: string): Promise<HTMLElement> => {
    await fixture.whenStable();
    queryTestId(testId).injector.get(MatMenuTrigger).openMenu();
    await fixture.whenStable();
    return overlayContainer.getContainerElement();
  };

  const selectGroupFive = (permissions: string[]) => {
    store.dispatch(new SetSelectedGroupId("5"));
    store.dispatch(new SetPermissions([], { 5: permissions }));
  };

  beforeEach(async () => {
    isHandset.set(false);

    await TestBed.configureTestingModule({
    declarations: [SidebarComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [NgxsModule.forRoot([AuthState, LayoutState, GroupState, FeatureConfigState, ShoppingListState]),
        DirectivesModule,
        MatMenuModule,
        MatSnackBarModule,
        MatSidenavModule,
        MatTooltipModule,
        NoopAnimationsModule,
        RouterTestingModule,
        SharedUiModule,
        ApiModule],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptorsFromDi()),
      { provide: ViewportService, useValue: { isHandset } },
    ]
}).compileComponents();

    store = TestBed.inject(Store);
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("reflects the active route's fullHeight data in isContentFullHeight", async () => {
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: "plain", children: [] },
      { path: "full", data: { fullHeight: true }, children: [] },
    ]);

    await router.navigateByUrl("/plain");
    await fixture.whenStable();
    expect(component.isContentFullHeight()).toBe(false);

    await router.navigateByUrl("/full");
    await fixture.whenStable();
    expect(component.isContentFullHeight()).toBe(true);
  });

  describe("main navigation", () => {
    beforeEach(() => {
      login();
      store.dispatch(
        new SetGroups([
          { id: 10, name: "All", isAllGroup: true } as Group,
          { id: 5, name: "Home", isAllGroup: false } as Group,
        ])
      );
    });

    it("always offers Receipts", async () => {
      selectGroupFive([]);
      await fixture.whenStable();
      expect(queryTestId("nav-receipts")).toBeTruthy();
    });


    it("offers Shopping Lists for a readable real group even while the All group is selected", async () => {
      store.dispatch(new SetSelectedGroupId("10"));
      store.dispatch(new SetPermissions([], { 10: [Permission.GroupShoppingListsRead] }));
      await fixture.whenStable();
      expect(queryTestId("nav-shopping-lists")).toBeFalsy();

      store.dispatch(new SetPermissions([], { 5: [Permission.GroupShoppingListsRead] }));
      await fixture.whenStable();
      expect(queryTestId("nav-shopping-lists").nativeElement.getAttribute("href")).toBe("/shopping-lists/group/5");
    });

    it("leads with the Overview when the selected group's receipts are readable", async () => {
      selectGroupFive([]);
      await fixture.whenStable();
      expect(queryTestId("nav-overview")).toBeFalsy();

      selectGroupFive([Permission.GroupReceiptsRead]);
      await fixture.whenStable();
      const links = fixture.debugElement.queryAll(By.css('[data-testid^="nav-"]'));
      expect(links[0].nativeElement.getAttribute("data-testid")).toBe("nav-overview");
      expect(links[0].nativeElement.getAttribute("href")).toBe("/overview/group/5");
    });

    it("lands on the group's overview when switching groups", () => {
      const navigate = jest.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

      component.groupClicked(5);

      expect(navigate).toHaveBeenCalledWith(["/overview/group/5"]);
    });

    it("offers Reports with either reports read permission", async () => {
      await fixture.whenStable();
      expect(queryTestId("nav-reports")).toBeFalsy();

      store.dispatch(new SetPermissions([Permission.AppReportsReadAll], {}));
      await fixture.whenStable();
      expect(queryTestId("nav-reports")).toBeTruthy();
    });
  });

  describe("Manage", () => {
    it("is absent without any administration permission", async () => {
      login();
      await fixture.whenStable();

      expect(queryTestId("sidebar-manage-toggle")).toBeFalsy();
    });

    it("lists only the administration pages the user may read, once expanded", async () => {
      login();
      store.dispatch(
        new SetGroups([
          { id: 10, name: "All", isAllGroup: true } as Group,
          { id: 5, name: "Home", isAllGroup: false } as Group,
          { id: 6, name: "Cabin", isAllGroup: false } as Group,
        ])
      );
      store.dispatch(
        new SetPermissions(
          ["app.categories.read", "app.tags.read", "app.groups.read", "app.custom-fields.read"],
          {}
        )
      );
      await fixture.whenStable();
      expect(queryTestId("sidebar-manage-items")).toBeFalsy();

      queryTestId("sidebar-manage-toggle").nativeElement.click();
      await fixture.whenStable();

      const text = sidebarText();
      expect(text).toContain("Manage Categories");
      expect(text).toContain("Manage Tags");
      expect(text).toContain("Manage Households");
      expect(text).toContain("Manage Custom Fields");
      expect(text).not.toContain("Manage Users");
      expect(text).not.toContain("System Settings");
    });

    it("shows the AI page but not System Settings to a member holding the receipt-processing permissions", async () => {
      login();
      store.dispatch(
        new SetPermissions(
          [
            "app.categories.read",
            "app.receipt-processing-settings.read",
            "app.receipt-processing-settings.update",
          ],
          {}
        )
      );
      await fixture.whenStable();
      queryTestId("sidebar-manage-toggle").nativeElement.click();
      await fixture.whenStable();

      const text = sidebarText();
      expect(text).toContain("AI");
      expect(text).not.toContain("System Settings");
    });

    it("keeps Manage Households but hides the group switcher while there is only one real group (Phase 3 M5)", async () => {
      login();
      store.dispatch(
        new SetGroups([
          { id: 10, name: "All", isAllGroup: true } as Group,
          { id: 5, name: "Household", isAllGroup: false } as Group,
        ])
      );
      store.dispatch(new SetPermissions(["app.categories.read", "app.groups.read"], {}));
      await fixture.whenStable();

      queryTestId("sidebar-manage-toggle").nativeElement.click();
      await fixture.whenStable();

      expect(sidebarText()).toContain("Manage Households");
      expect(queryTestId("sidebar-group-switcher")).toBeFalsy();
      expect(queryTestId("sidebar-group-static").nativeElement.textContent).toContain("Household");
    });

    it("starts expanded on one of its own pages", async () => {
      const router = TestBed.inject(Router);
      router.resetConfig([{ path: "categories", children: [] }]);
      login();
      store.dispatch(new SetPermissions(["app.categories.read"], {}));

      await router.navigateByUrl("/categories");
      await fixture.whenStable();

      expect(queryTestId("sidebar-manage-items")).toBeTruthy();
    });
  });

  describe("account menu", () => {
    it("hides User Settings without any settings read permission", async () => {
      login();
      const menu = await openMenu("sidebar-avatar-menu");

      expect(menu.textContent).not.toContain("User Settings");
      expect(menu.textContent).toContain("About");
      expect(menu.textContent).toContain("Logout");
    });

    it("shows User Settings with a settings read permission", async () => {
      login();
      store.dispatch(new SetPermissions(["app.account.read"], {}));
      const menu = await openMenu("sidebar-avatar-menu");

      expect(menu.textContent).toContain("User Settings");
    });
  });

  // Adding lives on the Dashboard now (Phase 3 D3): "Add receipt" and "New list" there.
  it("has no New menu, whatever the user may add", async () => {
    login();
    store.dispatch(new SetFeatureConfig({ aiPoweredReceipts: true } as FeatureConfig));
    selectGroupFive([Permission.GroupReceiptsCreate, Permission.GroupReceiptsQuickScan]);
    await fixture.whenStable();

    expect(queryTestId("sidebar-add-fab")).toBeFalsy();
    expect(queryTestId("sidebar-quick-scan")).toBeFalsy();
  });

  describe("the spartan sidebar", () => {
    it("closes the phone sheet when the route changes", async () => {
      login();
      const service = TestBed.inject(HlmSidebarService);
      const router = TestBed.inject(Router);
      router.resetConfig([{ path: "receipts", children: [] }]);
      const setOpenMobile = jest.spyOn(service, "setOpenMobile");

      await router.navigateByUrl("/receipts");
      await fixture.whenStable();

      expect(setOpenMobile).toHaveBeenCalledWith(false);
    });

    it("renders the sidebar (collapsible to icons) for a signed-in user and no sidebar for a guest", async () => {
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector("hlm-sidebar")).toBeNull();

      login();
      await fixture.whenStable();
      const sidebar = fixture.nativeElement.querySelector("hlm-sidebar");
      expect(sidebar).not.toBeNull();
    });
  });
});
