import { TestBed } from "@angular/core/testing";
import { ParameterizedDataParser } from "./paramterterized-data-parser";
import { seedStore } from "../testing/seed-store";
import { UserStore } from "../store/user.store";
import { GroupStore } from "../store/group.store";

describe("ParameterizedDataParser", () => {
  let parameterizedDataParser: ParameterizedDataParser;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [],
    }).compileComponents();

    parameterizedDataParser = TestBed.inject(ParameterizedDataParser);
  });

  it("create an instance", () => {
    expect(parameterizedDataParser).toBeTruthy();
  });

  it("should resolve userId", () => {
    const user = { id: "1", name: "John" };
    seedStore(TestBed.inject(UserStore), {
      users: [user],
    });

    const result = parameterizedDataParser.parse("${userId:1.name}");

    expect(result).toBe("John");
  });

  it("should resolve groupId and display it if it is type string", () => {
    const group = { id: "1", name: "Group A" };
    seedStore(TestBed.inject(GroupStore), {
      groups: [group],
    });

    const result = parameterizedDataParser.parse("${groupId:1.name:string}");

    expect(result).toBe("Group A");
  });

  it("should resolve groupId and not display it if it is type link", () => {
    const group = { id: "1", name: "Group A" };
    seedStore(TestBed.inject(GroupStore), {
      groups: [group],
    });

    const result = parameterizedDataParser.parse("${groupId:1.name:link}");

    expect(result).toBe("");
    expect(parameterizedDataParser.link).toEqual("/receipts/group/1");
  });

  it("should resolve receiptId and not display it if it is type link", () => {
    const result = parameterizedDataParser.parse("${receiptId:1.noop:link}");

    expect(result).toBe("");
    expect(parameterizedDataParser.link).toEqual("/receipts/1/view");
  });

  it("should resolve multiple pieces of paramterized data", () => {
    const group = { id: "1", name: "Hello" };
    const group2 = { id: "2", name: "World" };
    seedStore(TestBed.inject(GroupStore), {
      groups: [group, group2],
    });

    const result = parameterizedDataParser.parse(
      "${groupId:1.name:string} ${groupId:2.name:string}"
    );

    expect(result).toBe("Hello World");
  });

  it("should return empty string when id does not exist", () => {
    const result = parameterizedDataParser.parse("${userId:999.name}");

    expect(result).toBe("");
  });
});
