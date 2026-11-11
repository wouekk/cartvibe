import { Component, ChangeDetectionStrategy } from "@angular/core";
import { BaseInputComponent } from "../../base-input";
import { DateInputDirective } from "../date-input.directive";
import { ReactiveFormsModule } from "@angular/forms";
import { BrnFieldControl, BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { BrnInput } from "@spartan-ng/brain/input";
import { HlmInput } from "../../ui/input/lib/hlm-input";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { AsyncPipe } from "@angular/common";

let nextId = 0;

@Component({
    selector: "app-datepicker",
    templateUrl: "./datepicker.component.html",
    styleUrls: ["./datepicker.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DateInputDirective, ReactiveFormsModule, BrnFieldControl, BrnInput, BrnFieldControlDescribedBy, HlmInput, TranslatePipe, AsyncPipe]
})
export class DatepickerComponent extends BaseInputComponent {
  private readonly id = `app-datepicker-${nextId++}`;

  public fieldId(): string {
    return this.id;
  }
}
