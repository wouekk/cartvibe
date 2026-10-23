import { Component, OnChanges, SimpleChanges, input, ChangeDetectionStrategy } from "@angular/core";
import { FormControl } from "@angular/forms";
import { RECEIPT_STATUS_OPTIONS } from "src/constants";
import { familyReceiptStatus } from "../../utils/receipt-status";

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
    // Only "To check" and "Done" are offered (Phase 3 C6), so an older stored status is shown as
    // the one it reads as; saving writes that value.
    if (changes["inputFormControl"]) {
      const control = this.inputFormControl();
      const shown = familyReceiptStatus(control.value);
      if (shown !== control.value) {
        control.setValue(shown, { emitEvent: false });
      }
    }

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
