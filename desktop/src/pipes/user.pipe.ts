import { Pipe, PipeTransform, inject } from "@angular/core";
import { User } from "../open-api";
import { UserStore } from "../store";

@Pipe({ name: "user" })
export class UserPipe implements PipeTransform {
  private readonly userStore = inject(UserStore);

  // TODO: fix delete receipt busted
  // TODO: implement e2e
  public transform(userId?: string): User | undefined {
    return this.userStore.getUserById(userId ?? "");
  }
}
