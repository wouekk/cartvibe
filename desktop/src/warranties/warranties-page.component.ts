import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Store } from "@ngxs/store";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { catchError, map, of, switchMap } from "rxjs";
import { formatDateInput } from "../datepicker/date-input.directive";
import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { Receipt, ReceiptService, SortDirection } from "../open-api";
import { PipesModule } from "../pipes/pipes.module";
import { SharedUiModule } from "../shared-ui/shared-ui.module";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { ShopMonogramComponent } from "../shared-ui/shop-monogram/shop-monogram.component";
import { SystemSettingsState } from "../store/system-settings.state";
import { todayInZone } from "../utils/app-time-zone";
import { daysBetween } from "../utils/warranty-period";

interface WarrantyRow {
  receipt: Receipt;
  daysLeft: number;
}

/**
 * The Warranties list: every receipt the person can see whose warranty ends today or later, nearest end first, with
 * its end date and the days left. Expired warranties do not appear.
 */
@Component({
  selector: "app-warranties-page",
  templateUrl: "./warranties-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, PluralPipe, PipesModule, SharedUiModule, AppIconComponent, ShopMonogramComponent, ...HlmTableImports],
})
export class WarrantiesPageComponent {
  private readonly receiptService = inject(ReceiptService);
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);

  private readonly groupId = toSignal(this.route.paramMap.pipe(map((params) => Number(params.get("groupId")))), {
    initialValue: Number(this.route.snapshot.paramMap.get("groupId")),
  });

  private readonly today = computed(() => formatDateInput(todayInZone(this.store.selectSnapshot(SystemSettingsState.timeZone))));

  /** undefined while loading, so the empty state shows only once the list came back empty. */
  public readonly rows = toSignal(
    toObservable(this.groupId).pipe(
      switchMap((groupId) =>
        this.receiptService
          .getReceiptsForGroup(groupId, {
            page: 1,
            pageSize: 200,
            orderBy: "warranty_until",
            sortDirection: SortDirection.Asc,
            filter: { warrantyActive: true },
          })
          .pipe(
            map((page) =>
              (page.data as unknown as Receipt[]).map(
                (receipt): WarrantyRow => ({ receipt, daysLeft: daysBetween(this.today(), receipt.warrantyUntil) ?? 0 })
              )
            ),
            catchError(() => of([] as WarrantyRow[]))
          )
      )
    ),
    { initialValue: undefined }
  );
}
