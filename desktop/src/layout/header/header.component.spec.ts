import { TranslatePipe } from "../../i18n/translate.pipe";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { Store } from "@ngxs/store";
import { OverlayModule } from "@angular/cdk/overlay";
import { of } from "rxjs";
import { ViewportService } from "../../services/viewport.service";
import { ApiModule, Group, NotificationsService } from "../../open-api";
import { SetAuthState, SetPermissions } from "../../store/auth.state.actions";
import { GroupStore } from "../../store/group.store";
import { StoreModule } from "../../store/store.module";
import { HANDSET_LOGO_SCALE, HeaderComponent } from "./header.component";

describe("HeaderComponent", () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let store: Store;
  let notificationsService: NotificationsService;
  const isHandset = signal(false);

  const logIn = () =>
    store.dispatch(
      new SetAuthState({ exp: Math.floor(Date.now() / 1000) + 3600 } as any)
    );

  const grantNotificationsRead = () =>
    store.dispatch(new SetPermissions(["app.notifications.read"], {}));

  const bellRendered = (): boolean =>
    !!fixture.nativeElement.querySelector('[data-testid="header-notifications"]');

  beforeEach(async () => {
    // StoreModule persists auth (incl. permissions) to localStorage; clear it so
    // granted permissions don't leak across tests in this file.
    localStorage.clear();

    await TestBed.configureTestingModule({
    imports: [TranslatePipe, ApiModule,
        OverlayModule,
        StoreModule, HeaderComponent,],
    providers: [provideZonelessChangeDetection(), provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(), { provide: ViewportService, useValue: { isHandset } }],
    schemas: [NO_ERRORS_SCHEMA],
}).compileComponents();

    store = TestBed.inject(Store);
    notificationsService = TestBed.inject(NotificationsService);
    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.autoDetectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("has the spartan sidebar trigger for a signed-in user", async () => {
    logIn();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("[data-testid=sidebar-toggle]")).not.toBeNull();
  });

  it("should hide the notifications bell without app.notifications.read", async () => {
    logIn();
    await fixture.whenStable();

    expect(bellRendered()).toBe(false);
  });

  it("should show the notifications bell with app.notifications.read", async () => {
    logIn();
    grantNotificationsRead();
    await fixture.whenStable();

    expect(bellRendered()).toBe(true);
  });

  it("should have no search box: receipts are searched in the Receipts toolbar", async () => {
    logIn();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("app-searchbar")).toBeNull();
    expect(fixture.nativeElement.querySelector("app-product-check-input")).toBeNull();
  });

  it("has no palette menu and no day/night switch: the look is chosen in Settings, Theme", async () => {
    logIn();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("[data-testid=palette-menu]")).toBeNull();
    expect(fixture.nativeElement.querySelector("[data-testid=theme-toggle]")).toBeNull();
  });

  it("names the household on a phone, where the tab bar opens the sheet, and keeps the sidebar button elsewhere", async () => {
    TestBed.inject(GroupStore).setGroups([{ id: 3, name: "Home", isAllGroup: false } as Group, { id: 9, name: "All", isAllGroup: true } as Group]);
    TestBed.inject(GroupStore).setSelectedGroupId("9");
    logIn();
    isHandset.set(true);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("[data-testid=sidebar-toggle]")).toBeNull();
    expect(fixture.nativeElement.querySelector("[data-testid=header-household]").textContent).toContain("Home");

    isHandset.set(false);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("[data-testid=sidebar-toggle]")).not.toBeNull();
    expect(fixture.nativeElement.querySelector("[data-testid=header-household]")).toBeNull();
  });

  it("scales the logo to 30% on a handset and leaves it whole elsewhere", () => {
    isHandset.set(false);
    expect(component.logoScale()).toBe(1);

    isHandset.set(true);
    expect(component.logoScale()).toBe(HANDSET_LOGO_SCALE);
    expect(HANDSET_LOGO_SCALE).toBe(0.3);

    isHandset.set(false);
  });

  it("should not fetch the notification count without app.notifications.read", async () => {
    const countSpy = vi
      .spyOn(notificationsService, "getNotificationCount")
      .mockReturnValue(of(0) as any);

    logIn();
    await fixture.whenStable();

    expect(countSpy).not.toHaveBeenCalled();
  });

  it("should fetch the notification count once permission is present", async () => {
    const countSpy = vi
      .spyOn(notificationsService, "getNotificationCount")
      .mockReturnValue(of(3) as any);

    logIn();
    grantNotificationsRead();
    TestBed.flushEffects();
    await fixture.whenStable();

    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(component.notificationCount()).toBe(3);
  });

});
