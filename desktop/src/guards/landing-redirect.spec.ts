import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { GroupState } from "../store";
import { SetSelectedGroupId } from "../store/group.state.actions";
import { redirectToLanding } from "./landing-redirect";

describe("redirectToLanding", () => {
  let store: Store;
  let router: Router;
  let navigate: jest.SpyInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([GroupState])],
      providers: [{ provide: Router, useValue: { navigate: jest.fn() } }],
    });
    store = TestBed.inject(Store);
    router = TestBed.inject(Router);
    navigate = jest.spyOn(router, "navigate");
    store.dispatch(new SetSelectedGroupId("5"));
  });

  it("sends a denied user to the landing page", () => {
    expect(redirectToLanding(router, store, "/categories")).toBe(false);
    expect(navigate).toHaveBeenCalledWith(["/receipts/group/5"]);
  });

  it("does not redirect onto the page the user was just denied, which would loop forever", () => {
    expect(redirectToLanding(router, store, "/receipts/group/5?page=2")).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
