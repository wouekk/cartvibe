import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from "@angular/core";
import { FormControl } from "@angular/forms";
import { Store } from "@ngxs/store";
import { HlmButton } from "@spartan-ng/helm/button";
import { take } from "rxjs";
import { DatepickerModule } from "../../datepicker/datepicker.module";
import { formatDateInput, parseDateInput } from "../../datepicker/date-input.directive";
import { PluralPipe, TranslatePipe } from "../../i18n/translate.pipe";
import { Receipt, ReceiptService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SnackbarService } from "../../services/snackbar.service";
import { WebPushService } from "../../services/web-push.service";
import { AuthState } from "../../store";
import { SystemSettingsState } from "../../store/system-settings.state";
import { calendarDayToLocalDate, todayInZone } from "../../utils/app-time-zone";
import { addWarrantyYears, daysBetween, effectiveRegion, warrantyYears } from "../../utils/warranty-period";

/**
 * A receipt's warranty date, on its view and edit page. "Add warranty date" opens the picker at the receipt day plus
 * the person's warranty period (Settings → User Preferences); the date can be changed or removed. It saves on its own
 * (PUT /receipt/{id}/warranty), apart from the receipt form, and the first save asks to allow notifications for the
 * reminder.
 */
@Component({
  selector: "app-receipt-warranty",
  templateUrl: "./receipt-warranty.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatepickerModule, HlmButton, PipesModule, TranslatePipe, PluralPipe],
})
export class ReceiptWarrantyComponent {
  private readonly receiptService = inject(ReceiptService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly webPush = inject(WebPushService);
  private readonly store = inject(Store);

  public readonly receipt = input.required<Receipt>();

  public readonly canEdit = input(false);

  /** The stored date, "yyyy-MM-dd" or null; follows the receipt and every save. */
  public readonly warrantyUntil = linkedSignal(() => this.receipt().warrantyUntil ?? null);

  public readonly editing = signal(false);

  public readonly saving = signal(false);

  public readonly control = new FormControl<Date | null>(null);

  private readonly today = computed(() => formatDateInput(todayInZone(this.store.selectSnapshot(SystemSettingsState.timeZone))));

  /** Days until the warranty ends (0 today, negative once it has ended), or null without a date. */
  public readonly daysLeft = computed(() => daysBetween(this.today(), this.warrantyUntil()));

  /** Where the picker starts for a new date: the receipt day plus the chosen period, or Automatic by region. */
  public startDate(): Date {
    const preferences = this.store.selectSnapshot(AuthState.userPreferences);
    const years = warrantyYears(preferences?.warrantyPeriodYears, effectiveRegion(preferences?.region));
    const purchased = calendarDayToLocalDate(this.receipt().date) ?? new Date();
    return addWarrantyYears(purchased, years);
  }

  public add(): void {
    this.control.setValue(this.startDate());
    this.editing.set(true);
  }

  public change(): void {
    this.control.setValue(parseDateInput(this.warrantyUntil() ?? "") ?? this.startDate());
    this.editing.set(true);
  }

  public cancel(): void {
    this.editing.set(false);
  }

  public save(): void {
    const day = formatDateInput(this.control.value);
    if (!day) {
      this.snackbarService.error("Pick the day the warranty ends.");
      return;
    }
    this.persist(day);
  }

  public remove(): void {
    this.persist(null);
  }

  private persist(day: string | null): void {
    if (this.saving()) {
      return;
    }
    const isFirstDate = day !== null && this.warrantyUntil() === null;
    this.saving.set(true);
    this.receiptService
      // "" clears the date (the API reads an empty or missing day as no warranty).
      .setReceiptWarranty(this.receipt().id, { warrantyUntil: day ?? "" })
      .pipe(take(1))
      .subscribe({
        next: (saved) => {
          this.warrantyUntil.set(saved.warrantyUntil ?? null);
          this.editing.set(false);
          this.saving.set(false);
          if (day) {
            this.snackbarService.success("Warranty date saved");
          } else {
            this.snackbarService.success("Warranty date removed");
          }
          if (isFirstDate) {
            void this.webPush.enableForWarranties();
          }
        },
        // The interceptor toasts the error.
        error: () => this.saving.set(false),
      });
  }
}
