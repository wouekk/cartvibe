import { Component, Input, input } from "@angular/core";
import { ReceiptStatus } from "../../open-api";

@Component({
    selector: "app-status-chip",
    templateUrl: "./status-chip.component.html",
    styleUrls: ["./status-chip.component.scss"],
    standalone: false
})
export class StatusChipComponent {
  @Input() public status: string = "";

  @Input() public customStatus: string = "";

  public readonly customStatusColor = input<"red" | "green" | "gray" | "yellow">();

  public receiptStatus = ReceiptStatus;
}
