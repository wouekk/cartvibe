import { TestBed } from "@angular/core/testing";
import { NavigationStart, Router } from "@angular/router";
import { SwUpdate } from "@angular/service-worker";
import { Subject } from "rxjs";
import { AppUpdateService } from "./app-update.service";

describe("AppUpdateService", () => {
  let versionUpdates: Subject<any>;
  let routerEvents: Subject<any>;
  let swUpdate: { isEnabled: boolean; versionUpdates: Subject<any>; activateUpdate: jest.Mock; checkForUpdate: jest.Mock };

  function create(isEnabled = true): AppUpdateService {
    versionUpdates = new Subject();
    routerEvents = new Subject();
    swUpdate = {
      isEnabled,
      versionUpdates,
      activateUpdate: jest.fn().mockResolvedValue(true),
      checkForUpdate: jest.fn().mockResolvedValue(false),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: swUpdate },
        { provide: Router, useValue: { events: routerEvents } },
      ],
    });

    const service = TestBed.inject(AppUpdateService);
    jest.spyOn(service, "navigateToUrl").mockImplementation(() => undefined);
    return service;
  }

  it("loads the target page from the new version on the next navigation", async () => {
    const service = create();
    versionUpdates.next({ type: "VERSION_READY" });

    routerEvents.next(new NavigationStart(1, "/receipts"));
    await Promise.resolve();
    await Promise.resolve();

    expect(swUpdate.activateUpdate).toHaveBeenCalledTimes(1);
    expect(service.navigateToUrl).toHaveBeenCalledWith("/receipts");
  });

  it("leaves navigation alone while no update is ready", async () => {
    const service = create();
    versionUpdates.next({ type: "VERSION_DETECTED" });

    routerEvents.next(new NavigationStart(1, "/receipts"));
    await Promise.resolve();

    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
    expect(service.navigateToUrl).not.toHaveBeenCalled();
  });

  it("applies an update once, not on every later navigation", async () => {
    create();
    versionUpdates.next({ type: "VERSION_READY" });

    routerEvents.next(new NavigationStart(1, "/a"));
    routerEvents.next(new NavigationStart(2, "/b"));
    await Promise.resolve();

    expect(swUpdate.activateUpdate).toHaveBeenCalledTimes(1);
  });

  it("checks for an update when the tab becomes visible", () => {
    create();

    document.dispatchEvent(new Event("visibilitychange"));

    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a service worker", () => {
    create(false);
    versionUpdates.next({ type: "VERSION_READY" });
    routerEvents.next(new NavigationStart(1, "/receipts"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
  });
});
