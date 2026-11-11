import { Component, input, ChangeDetectionStrategy } from "@angular/core";
import { SystemTaskStatus } from "../../open-api";
import { NgSwitch, NgSwitchCase } from "@angular/common";
import { AppIconComponent } from "../icon/icon.component";

@Component({
    selector: "app-status-icon",
    templateUrl: "./status-icon.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgSwitch, NgSwitchCase, AppIconComponent]
})
export class StatusIconComponent {
  public readonly taskStatus = input.required<SystemTaskStatus>();
  protected readonly SystemTaskStatus = SystemTaskStatus;
}
