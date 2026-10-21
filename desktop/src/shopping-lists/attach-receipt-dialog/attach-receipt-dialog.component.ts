import { CurrencyPipe } from "@angular/common";
import { Component, Input, OnInit, signal } from "@angular/core";
import { AppDialogRef } from "../../dialog/app-dialog";
import { catchError, map, of, take } from "rxjs";
import { Receipt, ReceiptService, SortDirection } from "../../open-api";

/** How many of the group's newest receipts the dialog offers. */
export const ATTACHABLE_RECEIPT_COUNT = 15;

/** Picks one of the group's recent receipts to attach to a list. Closes with the receipt's id. */
@Component({
  selector: "app-attach-receipt-dialog",
  templateUrl: "./attach-receipt-dialog.component.html",
  styleUrls: ["./attach-receipt-dialog.component.scss"],
  standalone: false,
  // customCurrency delegates to CurrencyPipe, which PipesModule does not provide.
  providers: [CurrencyPipe],
})
export class AttachReceiptDialogComponent implements OnInit {
  @Input() public groupId!: number;

  /** Receipts already on this list, left out of the choices. */
  @Input() public attachedReceiptIds: number[] = [];

  /** Undefined while loading. */
  public readonly receipts = signal<Receipt[] | undefined>(undefined);

  constructor(
    private receiptService: ReceiptService,
    private matDialogRef: AppDialogRef<AttachReceiptDialogComponent, number>
  ) {}

  public ngOnInit(): void {
    const attached = new Set(this.attachedReceiptIds);

    this.receiptService
      .getReceiptsForGroup(this.groupId, {
        page: 1,
        pageSize: ATTACHABLE_RECEIPT_COUNT,
        orderBy: "date",
        sortDirection: SortDirection.Desc,
      })
      .pipe(
        take(1),
        // The generated item type is a merge of every paged model, so it needs an explicit narrowing.
        map((page) => (page.data as unknown as Receipt[]).filter((receipt) => !attached.has(receipt.id))),
        catchError(() => of([] as Receipt[]))
      )
      .subscribe((receipts) => this.receipts.set(receipts));
  }

  public pick(receipt: Receipt): void {
    this.matDialogRef.close(receipt.id);
  }

  public close(): void {
    this.matDialogRef.close();
  }
}
