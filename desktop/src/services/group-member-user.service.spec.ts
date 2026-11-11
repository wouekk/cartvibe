import { TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { GroupState } from "../store";
import { GroupMemberUserService } from "./group-member-user.service";
import { seedStore } from "../testing/seed-store";
import { UserStore } from "../store/user.store";

describe("GroupMemberUserService", () => {
  let service: GroupMemberUserService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NgxsModule.forRoot([GroupState])],
    });
    service = TestBed.inject(GroupMemberUserService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("should get correct users in group", () => {
    const store = TestBed.inject(Store);
    store.reset({
      groups: {
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
      },
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
    const store = TestBed.inject(Store);
    store.reset({
      groups: {
        groups: [],
      },
    });
    seedStore(TestBed.inject(UserStore), {});

    const users = service.getUsersInGroup("1");
    expect(users).toEqual([]);
  });
});
