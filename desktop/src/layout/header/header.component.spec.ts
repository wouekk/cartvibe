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
import { HeaderComponent } from "./header.component";

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

  const productCheckRendered = (): boolean =>
    !!fixture.nativeElement.querySelector("app-product-check-input");

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

  it("should show the product checker to every signed-in user, with no permission", async () => {
    logIn();
    await fixture.whenStable();

    expect(productCheckRendered()).toBe(true);
    expect(fixture.nativeElement.querySelector("app-searchbar")).toBeNull();
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
