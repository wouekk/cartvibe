import { Component, Input, input, ChangeDetectionStrategy } from "@angular/core";
import { DONE_STATUSES, receiptStatusLabel, TO_CHECK_STATUSES } from "../../utils/receipt-status";

/**
 * A receipt's status as a family reads it: "To check" in yellow, "Done" in green. A
 * status this build does not know shows as it came, uncoloured.
 */
@Component({
    selector: "app-status-chip",
    templateUrl: "./status-chip.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class StatusChipComponent {
  @Input() public status: string = "";

  @Input() public customStatus: string = "";

  public readonly customStatusColor = input<"red" | "green" | "gray" | "yellow">();

  public label(): string {
    return receiptStatusLabel(this.status);
  }

  public isToCheck(): boolean {
    return TO_CHECK_STATUSES.includes(this.status);
  }

  public isDone(): boolean {
    return DONE_STATUSES.includes(this.status);
  }
}
