import { CurrencyPipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, computed, effect, input, signal, untracked } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AppDialog } from "../../dialog/app-dialog";
import { Actions, ofActionDispatched, Store } from "@ngxs/store";
import { catchError, EMPTY, filter, merge, Observable, switchMap, take } from "rxjs";
import { Permission, ShoppingListService, ShoppingTripView } from "../../open-api";
import { SnackbarService } from "../../services";
import { ConfirmationDialogComponent } from "../../shared-ui/confirmation-dialog/confirmation-dialog.component";
import { AuthState } from "../../store";
import { ShoppingListEventType } from "../../store/shopping-list.state";
import { ApplyShoppingListEvent, LoadShoppingLists } from "../../store/shopping-list.state.actions";
import { hasAll } from "../../utils/permission.utils";
import { AttachReceiptDialogComponent } from "../attach-receipt-dialog/attach-receipt-dialog.component";
import { describeShoppingTrip, ShoppingTripStatus } from "./shopping-trip-status";

interface ShoppingTripRow {
  trip: ShoppingTripView;
  status: ShoppingTripStatus;
}

/**
 * The receipts attached to a list, and what each bought that was not on it. A photo scanned here is
 * kept until the AI can read it, so it works in a shop with no AI credits left. Trips are refetched
 * whenever the stream says they changed, and whenever the lists are reloaded (a reconnect, or the
 * tab coming back into view).
 */
@Component({
  selector: "app-shopping-trips",
  templateUrl: "./shopping-trips.component.html",
  host: { class: "block" },
  standalone: false,
  // customCurrency delegates to CurrencyPipe, which PipesModule does not provide.
  providers: [CurrencyPipe],
})
export class ShoppingTripsComponent {
  public readonly listId = input.required<number>();

  public readonly groupId = input.required<number>();

  private readonly groupPermissions = this.store.selectSignal(AuthState.groupPermissions);

  private readonly permissions = computed(() => this.groupPermissions()[this.groupId()] ?? []);

  /** A trip shows its receipt and what was bought, so it needs receipt access as well as the list's. */
  public readonly canSee = computed(() =>
    hasAll(this.permissions(), Permission.GroupShoppingListsRead, Permission.GroupReceiptsRead)
  );

  public readonly canUpdate = computed(() =>
    hasAll(this.permissions(), Permission.GroupShoppingListsUpdate, Permission.GroupReceiptsRead)
  );

  /** A photo becomes a receipt the way Quick Scan does. */
  public readonly canScan = computed(
    () => this.canUpdate() && hasAll(this.permissions(), Permission.GroupReceiptsQuickScan)
  );

  public readonly trips = signal<ShoppingTripView[]>([]);

  public readonly rows = computed<ShoppingTripRow[]>(() =>
    this.trips().map((trip) => ({ trip, status: describeShoppingTrip(trip) }))
  );

  public readonly uploading = signal(false);

  constructor(
    private store: Store,
    private actions: Actions,
    private shoppingListService: ShoppingListService,
    private matDialog: AppDialog,
    private snackbarService: SnackbarService
  ) {
    effect(() => {
      const listId = this.listId();
      if (this.canSee()) {
        untracked(() => this.load(listId));
      } else {
        untracked(() => this.trips.set([]));
      }
    });

    merge(
      this.actions.pipe(
        ofActionDispatched(ApplyShoppingListEvent),
        filter(
          (action: ApplyShoppingListEvent) =>
            action.event.type === ShoppingListEventType.TripsChanged && action.event.shoppingListId === this.listId()
        )
      ),
      this.actions.pipe(ofActionDispatched(LoadShoppingLists))
    )
      .pipe(
        filter(() => this.canSee()),
        takeUntilDestroyed()
      )
      .subscribe(() => this.load(this.listId()));
  }

  public scanSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so picking the same file again still fires a change.
    input.value = "";
    if (!file || this.uploading()) {
      return;
    }

    this.uploading.set(true);
    this.shoppingListService
      .uploadShoppingTripPhoto(this.listId(), file)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.uploading.set(false);
          this.snackbarService.success("Receipt saved. It will be compared with the list shortly.");
          this.load(this.listId());
        },
        error: (error: HttpErrorResponse) => {
          this.uploading.set(false);
          this.reportIfOffline(error);
        },
      });
  }

  public attachExisting(): void {
    const dialogRef = this.matDialog.open(AttachReceiptDialogComponent);
    dialogRef.componentInstance.groupId = this.groupId();
    dialogRef.componentInstance.attachedReceiptIds = this.trips()
      .map((trip) => trip.receipt?.id)
      .filter((id): id is number => id !== undefined);

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        filter((receiptId): receiptId is number => typeof receiptId === "number"),
        switchMap((receiptId) =>
          this.shoppingListService.attachShoppingTripReceipt(this.listId(), { receiptId })
        )
      )
      .subscribe({
        next: () => this.load(this.listId()),
        error: (error: HttpErrorResponse) => this.reportIfOffline(error),
      });
  }

  public retry(trip: ShoppingTripView): void {
    this.shoppingListService
      .retryShoppingTrip(trip.id)
      .pipe(take(1))
      .subscribe({
        next: () => this.load(this.listId()),
        error: (error: HttpErrorResponse) => this.reportIfOffline(error),
      });
  }

  public remove(trip: ShoppingTripView): void {
    this.confirm("Remove Receipt", "Remove this receipt from the list? The receipt itself is kept.")
      .pipe(switchMap(() => this.shoppingListService.detachShoppingTrip(trip.id)))
      .subscribe({
        next: () => this.trips.set(this.trips().filter((candidate) => candidate.id !== trip.id)),
        error: (error: HttpErrorResponse) => this.reportIfOffline(error),
      });
  }

  private load(listId: number): void {
    this.shoppingListService
      .getShoppingTrips(listId)
      .pipe(
        take(1),
        catchError(() => EMPTY)
      )
      .subscribe((trips) => {
        // A slow answer for a list the user has since left must not replace the new list's trips.
        if (listId === this.listId()) {
          this.trips.set(trips);
        }
      });
  }

  private confirm(headerText: string, dialogContent: string): Observable<unknown> {
    const dialogRef = this.matDialog.open(ConfirmationDialogComponent);
    dialogRef.componentInstance.headerText = headerText;
    dialogRef.componentInstance.dialogContent = dialogContent;

    // Truthiness, not === true: a backdrop click or ESC closes with undefined.
    return dialogRef.afterClosed().pipe(
      take(1),
      filter((confirmed) => !!confirmed)
    );
  }

  /** The HTTP interceptor toasts server errors; a request that never reached the server it does not. */
  private reportIfOffline(error: HttpErrorResponse): void {
    if (error.status === 0) {
      this.snackbarService.error("Couldn't reach the server. Check your connection and try again.");
    }
  }
}
