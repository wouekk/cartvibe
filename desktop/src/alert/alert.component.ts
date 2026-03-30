import { CommonModule } from "@angular/common";
import { Component, input } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

@Component({
    selector: "app-alert",
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule
    ],
    templateUrl: "./alert.component.html",
    styleUrl: "./alert.component.scss"
})
export class AlertComponent {
  public readonly type = input<"warning">("warning");
  public readonly message = input<string>("");
}
