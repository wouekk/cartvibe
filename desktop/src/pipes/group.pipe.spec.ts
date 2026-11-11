import { TestBed } from "@angular/core/testing";
import { Group } from "../open-api";
import { GroupStore } from "../store/group.store";
import { seedStore } from "../testing/seed-store";
import { GroupPipe } from "./group.pipe";

describe("GroupPipe", () => {
  let pipe: GroupPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GroupPipe] });

    seedStore(TestBed.inject(GroupStore), { groups: [{ id: 1, name: "Home" } as Group, { id: 2, name: "Cabin" } as Group] });
    pipe = TestBed.inject(GroupPipe);
  });

  it("create an instance", () => {
    expect(pipe).toBeTruthy();
  });

  it("finds the household by its id, and nothing for an id nobody has", () => {
    expect(pipe.transform("2")?.name).toBe("Cabin");
    expect(pipe.transform("hello")).toBeUndefined();
  });
});
