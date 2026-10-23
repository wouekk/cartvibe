import { Component, input, ChangeDetectionStrategy } from "@angular/core";
import { Group, User } from "../../open-api";

@Component({
    selector: "app-avatar",
    templateUrl: "./avatar.component.html",
    styleUrls: ["./avatar.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AvatarComponent {
  public readonly user = input<User>();
  public readonly group = input<Group>();
}
