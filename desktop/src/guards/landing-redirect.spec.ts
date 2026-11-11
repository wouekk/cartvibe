import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { GroupStore } from "../store";
import { redirectToLanding } from "./landing-redirect";

import type { MockInstance } from "vitest";
describe("redirectToLanding", () => {
  let landing: string;
  let router: Router;
  let navigate: MockInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { navigate: vi.fn() } }],
    });
    router = TestBed.inject(Router);
    navigate = vi.spyOn(router, "navigate");
    TestBed.inject(GroupStore).setSelectedGroupId("5");
    landing = TestBed.inject(GroupStore).dashboardLink();
  });

  it("sends a denied user to the landing page", () => {
    expect(redirectToLanding(router, landing, "/categories")).toBe(false);
    expect(navigate).toHaveBeenCalledWith(["/receipts/group/5"]);
  });

  it("does not redirect onto the page the user was just denied, which would loop forever", () => {
    expect(redirectToLanding(router, landing, "/receipts/group/5?page=2")).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
