import { Pipe, PipeTransform, inject } from "@angular/core";
import { Group } from "../open-api";
import { GroupStore } from "../store";

@Pipe({ name: "group" })
export class GroupPipe implements PipeTransform {
  private readonly groupStore = inject(GroupStore);

  public transform(groupId: string): Group | undefined {
    return this.groupStore.getGroupById(groupId);
  }
}
