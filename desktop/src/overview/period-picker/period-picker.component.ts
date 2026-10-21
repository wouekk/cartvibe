import { Component, computed, effect, output, signal } from "@angular/core";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { Store } from "@ngxs/store";
import { FilterTab } from "../../shared-ui/filter-bar/filter-tab.interface";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { SystemSettingsState } from "../../store/system-settings.state";
import { todayInZone } from "../../utils/app-time-zone";
import {
  formatDayMonthYear,
  parseDayMonthYear,
  PERIOD_CHOICES,
  PeriodPreset,
  resolvePeriod,
  ResolvedPeriod,
} from "../overview-period";

/**
 * The period control shared by the Dashboard and the receipts table: the quick ranges, and From / To
 * fields that always show the period in DD/MM/YYYY. Editing a field turns the range custom. It owns the
 * choice and emits the resolved days (undefined while a custom range is incomplete).
 */
@Component({
  selector: "app-period-picker",
  templateUrl: "./period-picker.component.html",
  styleUrls: ["./period-picker.component.scss"],
  standalone: true,
  imports: [AppIconComponent, SharedUiModule],
})
export class PeriodPickerComponent {
  public readonly periodChange = output<ResolvedPeriod | undefined>();

  private readonly timeZone = this.store.selectSignal(SystemSettingsState.timeZone);

  public readonly periodTabs: FilterTab[] = PERIOD_CHOICES.map((choice) => ({
    value: choice.value,
    label: choice.label,
  }));

  /** The period shown: this month until the user picks another. */
  public readonly preset = signal<PeriodPreset>("THIS_MONTH");

  /** The custom range's ends as typed, DD/MM/YYYY. */
  public readonly customFrom = signal("");

  public readonly customTo = signal("");

  /** The days to ask for; undefined while a custom range is incomplete or backwards. */
  public readonly period = computed(() =>
    resolvePeriod(this.preset(), todayInZone(this.timeZone()), {
      from: parseDayMonthYear(this.customFrom()) ?? "",
      to: parseDayMonthYear(this.customTo()) ?? "",
    })
  );

  public readonly fromText = computed(() =>
    this.preset() === "CUSTOM" ? this.customFrom() : this.formatEnd(this.period()?.from)
  );

  public readonly toText = computed(() =>
    this.preset() === "CUSTOM" ? this.customTo() : this.formatEnd(this.period()?.to)
  );

  constructor(private store: Store) {
    effect(() => this.periodChange.emit(this.period()));
  }

  public selectPeriod(value: string): void {
    if (value === "CUSTOM") {
      this.adoptCustom();
      return;
    }
    this.preset.set(value as PeriodPreset);
  }

  public typeDay(target: "from" | "to", event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.adoptCustom();
    (target === "from" ? this.customFrom : this.customTo).set(text);
  }

  /** The calendar button: the browser's date picker answers with yyyy-MM-dd. */
  public pickDay(target: "from" | "to", event: Event): void {
    const day = (event.target as HTMLInputElement).value;
    if (!day) {
      return;
    }
    this.adoptCustom();
    (target === "from" ? this.customFrom : this.customTo).set(formatDayMonthYear(day));
  }

  /** Switches to a custom range that starts as the period on screen, so only one end has to change. */
  private adoptCustom(): void {
    if (this.preset() !== "CUSTOM") {
      const period = this.period();
      this.customFrom.set(this.formatEnd(period?.from));
      this.customTo.set(this.formatEnd(period?.to));
      this.preset.set("CUSTOM");
    }
  }

  private formatEnd(day: string | undefined): string {
    return day ? formatDayMonthYear(day) : "";
  }
}
