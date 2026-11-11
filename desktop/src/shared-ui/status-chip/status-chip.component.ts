import { Component, Input, input, ChangeDetectionStrategy } from "@angular/core";
import { isSettled, isToCheck, receiptStatusLabel } from "../../utils/receipt-status";
import { NgClass } from "@angular/common";
import { TranslatePipe } from "../../i18n/translate.pipe";

/**
 * A receipt's status as a family reads it: "To check" in yellow, "Settled" in green. A
 * status this build does not know shows as it came, uncoloured.
 */
@Component({
    selector: "app-status-chip",
    templateUrl: "./status-chip.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgClass, TranslatePipe]
})
export class StatusChipComponent {
  @Input() public status: string = "";

  @Input() public customStatus: string = "";

  public readonly customStatusColor = input<"red" | "green" | "gray" | "yellow">();

  public label(): string {
    return receiptStatusLabel(this.status);
  }

  public isToCheck(): boolean {
    return isToCheck(this.status);
  }

  public isDone(): boolean {
    return isSettled(this.status);
  }
}
