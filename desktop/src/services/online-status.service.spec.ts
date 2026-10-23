import { TestBed } from "@angular/core/testing";
import { OnlineStatusService } from "./online-status.service";

describe("OnlineStatusService", () => {
  it("follows the browser's online and offline events", () => {
    const service = TestBed.inject(OnlineStatusService);

    window.dispatchEvent(new Event("offline"));
    expect(service.online()).toBe(false);

    window.dispatchEvent(new Event("online"));
    expect(service.online()).toBe(true);
  });
});
