import { TranslatePipe } from "../../i18n/translate.pipe";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { Store } from "@ngxs/store";
import { OverlayModule } from "@angular/cdk/overlay";
import { of } from "rxjs";
import { ViewportService } from "../../services/viewport.service";
import { DirectivesModule } from "../../directives/directives.module";
import { ApiModule, NotificationsService } from "../../open-api";
import { SetAuthState, SetPermissions } from "../../store/auth.state.actions";
import { StoreModule } from "../../store/store.module";
import { SYSTEM_THEME_KEYS } from "../../theme/themes";
import { ThemeService } from "../../theme/theme.service";
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
    !!fixture.nativeElement.querySelector('app-button[icon="notifications"]');

  beforeEach(async () => {
    // StoreModule persists auth (incl. permissions) to localStorage; clear it so
    // granted permissions don't leak across tests in this file.
    localStorage.clear();

    await TestBed.configureTestingModule({
    declarations: [HeaderComponent],
    imports: [TranslatePipe, ApiModule,
        DirectivesModule,
        OverlayModule,
        StoreModule,
    ],
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

  it("offers a quick theme toggle that switches between the White and Black themes", async () => {
    const theme = TestBed.inject(ThemeService);
    const setMode = jest.spyOn(theme, "setMode").mockImplementation(() => undefined);

    logIn();
    await fixture.whenStable();

    const toggle = fixture.nativeElement.querySelector("[data-testid=theme-toggle]") as HTMLButtonElement;
    expect(toggle).not.toBeNull();

    const wasDark = component.isDarkTheme();
    toggle.click();

    expect(setMode).toHaveBeenCalledWith(wasDark ? SYSTEM_THEME_KEYS.light : SYSTEM_THEME_KEYS.dark);
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
    const countSpy = jest
      .spyOn(notificationsService, "getNotificationCount")
      .mockReturnValue(of(0));

    logIn();
    await fixture.whenStable();

    expect(countSpy).not.toHaveBeenCalled();
  });

  it("should fetch the notification count once permission is present", async () => {
    const countSpy = jest
      .spyOn(notificationsService, "getNotificationCount")
      .mockReturnValue(of(3));

    logIn();
    grantNotificationsRead();
    TestBed.flushEffects();
    await fixture.whenStable();

    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(component.notificationCount()).toBe(3);
  });
});
