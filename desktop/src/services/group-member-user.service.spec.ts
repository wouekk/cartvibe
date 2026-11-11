import { TestBed } from "@angular/core/testing";
import { GroupMemberUserService } from "./group-member-user.service";
import { seedStore } from "../testing/seed-store";
import { UserStore } from "../store/user.store";
import { GroupStore } from "../store/group.store";

describe("GroupMemberUserService", () => {
  let service: GroupMemberUserService;

  beforeEach(() => {
        service = TestBed.inject(GroupMemberUserService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("should get correct users in group", () => {
    seedStore(TestBed.inject(GroupStore), {
      groups: [
        {
          name: "Group 1",
          id: 1,
          groupMembers: [
            {
              userId: 1,
              groupId: 1,
            },
            {
              userId: 2,
              groupId: 1,
            },
            {
              userId: 3,
              groupId: 1,
            },
          ],
        },
      ],
    });
    seedStore(TestBed.inject(UserStore), {
      users: [
        {
          id: 1,
        },
        {
          id: 2,
        },
        {
          id: 3,
        },
      ],
    });

    const users = service.getUsersInGroup("1");
    expect(users).toEqual([
      {
        id: 1,
      },
      {
        id: 2,
      },
      {
        id: 3,
      },
    ] as any);
  });

  it("should return empty array if the group is invalid", () => {
    seedStore(TestBed.inject(GroupStore), {
      groups: [],
    });
    seedStore(TestBed.inject(UserStore), {});

    const users = service.getUsersInGroup("1");
    expect(users).toEqual([]);
  });
});
