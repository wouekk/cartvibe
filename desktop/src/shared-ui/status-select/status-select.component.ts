import { Component, OnChanges, SimpleChanges, input, ChangeDetectionStrategy } from "@angular/core";
import { FormControl } from "@angular/forms";
import { RECEIPT_STATUS_OPTIONS } from "src/constants";

/** A picker of the two receipt statuses, "To check" and "Settled", with an empty choice on request. */
@Component({
    selector: "app-status-select",
    templateUrl: "./status-select.component.html",
    styleUrls: ["./status-select.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class StatusSelectComponent implements OnChanges {
  public readonly inputFormControl = input.required<FormControl>();

  public readonly readonly = input<boolean>(false);

  public readonly addBlankOption = input<boolean>(false);

  public readonly label = input("Status");

  public receiptStatusOptions = [...RECEIPT_STATUS_OPTIONS];

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes["addBlankOption"]?.currentValue) {
      this.receiptStatusOptions.unshift({
        value: null,
        displayValue: "",
      });
    } else {
      this.receiptStatusOptions = [...RECEIPT_STATUS_OPTIONS];
    }
  }
}
