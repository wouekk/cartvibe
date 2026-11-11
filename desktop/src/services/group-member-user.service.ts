import { Injectable, inject } from "@angular/core";
import { GroupMember, User } from "../open-api";
import { UserStore, GroupStore } from "../store";

@Injectable({
  providedIn: "root",
})
export class GroupMemberUserService {
  private readonly groupStore = inject(GroupStore);

  private readonly userStore = inject(UserStore);

  public getUsersInGroup(groupId: string): User[] {
    const users: User[] = [];
    const groupMembers: GroupMember[] = this.groupStore.allGroupMembers()
      .filter((gm) => gm.groupId.toString() === groupId.toString());

    groupMembers.forEach((gm) => {
      const user = this.userStore.findUserById(gm.userId.toString());
      if (user) {
        users.push(user);
      }
    });
    return users;
  }
}
