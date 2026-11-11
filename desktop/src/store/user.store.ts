import { computed, Injectable } from "@angular/core";
import { User } from "../open-api/model/user";
import { StateStore } from "./state-store";

export interface UserStateInterface {
  users: User[];
}

/** Everyone on this server, for names and avatars; read at every start and kept between visits. */
@Injectable({ providedIn: "root" })
export class UserStore extends StateStore<UserStateInterface> {
  public readonly users = computed(() => this.state().users);

  constructor() {
    super(() => ({ users: [] }), "users");
  }

  /** The person with this id; undefined for no id. Reads the signal, so it follows the list inside a `computed`. */
  public getUserById(userId: string): User | undefined {
    if (!userId) {
      return undefined;
    }

    return this.findUserById(userId);
  }

  public findUserById(userId: string): User | undefined {
    return this.users().find((u) => u.id.toString() === userId.toString());
  }

  public setUsers(users: User[]): void {
    this.patch({ users });
  }

  public updateUser(userId: string, user: User): void {
    const users = Array.from(this.users());
    const index = users.findIndex((u) => u.id.toString() === userId);
    if (index >= 0) {
      users.splice(index, 1, user);
      this.patch({ users });
    }
  }

  public addUser(user: User): void {
    this.patch({ users: [...this.users(), user] });
  }

  public removeUser(userId: string): void {
    this.patch({ users: this.users().filter((u) => u.id.toString() !== userId.toString()) });
  }

  public removeUsers(userIds: string[]): void {
    this.patch({ users: this.users().filter((u) => !userIds.includes(u.id.toString())) });
  }
}
