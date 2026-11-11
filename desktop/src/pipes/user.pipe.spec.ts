import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { UserPipe } from "./user.pipe";
import { seedStore } from "../testing/seed-store";
import { UserStore } from "../store/user.store";

describe("UserPipe", () => {
  let pipe: UserPipe;
  let store: Store;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [NgxsModule.forRoot([]), UserPipe],
    providers: [UserPipe],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
}).compileComponents();

    store = TestBed.inject(Store);
    pipe = TestBed.inject(UserPipe);

    seedStore(TestBed.inject(UserStore), {
      users: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
  });

  it("create an instance", () => {
    expect(pipe).toBeTruthy();
  });

  it("should return a user", () => {
    const result = pipe.transform("1");

    expect(result).toEqual({ id: 1 } as any);
  });

  it("should return a user", () => {
    const result = pipe.transform("not a user id");

    expect(result).toEqual(undefined);
  });
});
