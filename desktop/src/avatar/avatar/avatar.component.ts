import { Component, input } from "@angular/core";
import { Group, User } from "../../open-api";

@Component({
    selector: "app-avatar",
    templateUrl: "./avatar.component.html",
    styleUrls: ["./avatar.component.scss"],
    standalone: false
})
export class AvatarComponent {
  public readonly user = input<User>();
  public readonly group = input<Group>();
}
