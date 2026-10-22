import { Group } from "../../open-api";
import { GroupTableEditButtonPipe } from "./group-table-edit-button.pipe";

describe("GroupTableEditButtonPipe", () => {
  let pipe: GroupTableEditButtonPipe;

  const mockGroup: Group = {
    id: 123,
    name: "Test Group",
  } as any;

  beforeEach(() => {
    pipe = new GroupTableEditButtonPipe();
  });

  it("should create the pipe", () => {
    expect(pipe).toBeTruthy();
  });

  describe("transform", () => {
    it("should return the details edit route when the user can update the group", () => {
      const result = pipe.transform(mockGroup, [], { 123: ["group.update"] });

      expect(result).toEqual(`/groups/${mockGroup.id}/details/edit`);
    });

    it("should return the view route when the user has neither permission", () => {
      const result = pipe.transform(mockGroup, [], {});

      expect(result).toEqual(`/groups/${mockGroup.id}/details/view`);
    });

    it("should fall back to the view route when the group has no permission entry", () => {
      const result = pipe.transform(mockGroup, [], { 456: ["group.update"] });

      expect(result).toEqual(`/groups/${mockGroup.id}/details/view`);
    });
  });
});
