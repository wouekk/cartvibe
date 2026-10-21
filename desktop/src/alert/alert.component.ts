import { CommonModule } from "@angular/common";
import { Component, input } from "@angular/core";
import { AppIconComponent } from "../shared-ui/icon/icon.component";

@Component({
    selector: "app-alert",
    standalone: true,
    imports: [
        CommonModule,
        AppIconComponent
    ],
    templateUrl: "./alert.component.html",
    styleUrl: "./alert.component.scss"
})
export class AlertComponent {
  public readonly type = input<"warning">("warning");
  public readonly message = input<string>("");
}
