import { Component } from "@angular/core";
import { BaseInputComponent } from "../../base-input";

let nextId = 0;

@Component({
    selector: "app-datepicker",
    templateUrl: "./datepicker.component.html",
    styleUrls: ["./datepicker.component.scss"],
    standalone: false
})
export class DatepickerComponent extends BaseInputComponent {
  private readonly id = `app-datepicker-${nextId++}`;

  public fieldId(): string {
    return this.id;
  }
}
