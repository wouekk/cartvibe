import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of, Subject, throwError } from "rxjs";
import { AppData, UserService } from "../../open-api";
import { SignInTransitionService } from "../../services/sign-in-transition.service";
import { AuthState, GroupState } from "../../store";
import { OidcCallbackComponent } from "./oidc-callback.component";

import type { Mock } from "vitest";

describe("OidcCallbackComponent", () => {
  let userService: { getAppData: Mock };
  let router: { navigate: Mock };

  const setUp = (answer: ReturnType<Mock>) => {
    userService = { getAppData: vi.fn(() => answer) };
    router = { navigate: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [OidcCallbackComponent, NgxsModule.forRoot([AuthState, GroupState])],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UserService, useValue: userService },
        { provide: Router, useValue: router },
      ],
    });

    const fixture = TestBed.createComponent(OidcCallbackComponent);
    fixture.detectChanges();
    return fixture;
  };

  const appData = {
    claims: { userId: 4, username: "alex", displayName: "Alex", exp: 4102444800 },
    groups: [{ id: 3, name: "Household", groupMembers: [] }],
    users: [],
    featureConfig: { enableLocalSignUp: false, aiPoweredReceipts: false },
    userPreferences: {},
  } as unknown as AppData;

  it("loads the account the new session belongs to, then opens the Dashboard under the sign-in splash", async () => {
    const answer = new Subject<AppData>();
    const fixture = setUp(answer);
    const transition = TestBed.inject(SignInTransitionService);

    expect(fixture.nativeElement.querySelector("[data-testid=oidc-callback]")).not.toBeNull();
    expect(transition.active()).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();

    answer.next(appData);
    answer.complete();
    await fixture.whenStable();

    const store = TestBed.inject(Store);
    expect(store.selectSnapshot(AuthState.isLoggedIn)).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith([store.selectSnapshot(GroupState.overviewLink)]);
    expect(transition.active()).toBe(false);
  });

  it("goes back to the login page with a reason when the account cannot be loaded", async () => {
    const fixture = setUp(throwError(() => new Error("403")));
    await fixture.whenStable();

    expect(router.navigate).toHaveBeenCalledWith(["/auth/login"], { queryParams: { oidcError: "invalid_state" } });
    expect(TestBed.inject(Store).selectSnapshot(AuthState.isLoggedIn)).toBe(false);
    expect(TestBed.inject(SignInTransitionService).active()).toBe(false);
  });

  it("asks for the account once", () => {
    setUp(of(appData));

    expect(userService.getAppData).toHaveBeenCalledTimes(1);
  });
});
