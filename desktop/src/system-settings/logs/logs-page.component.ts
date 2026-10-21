import { PluralPipe, TranslatePipe } from "../../i18n/translate.pipe";
import { CommonModule } from "@angular/common";
import { Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { HlmButton } from "@spartan-ng/helm/button";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { finalize } from "rxjs";
import { AppLogEntry, SystemSettingsService } from "../../open-api";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { SnackbarService } from "../../services";
import { marker } from "../../i18n/marker";

/** The level filters on offer; an empty value is "everything". */
export const LOG_LEVEL_FILTERS = [
  { label: "All", value: "" },
  { label: marker("Errors"), value: "ERROR" },
  { label: marker("Info"), value: "INFO" },
];

/**
 * The admin's Logs tab (Phase 3 M2): the newest lines of the application log, newest first, with a
 * level filter and a refresh. Read-only; the API gates it like System Settings.
 */
@Component({
  selector: "app-logs-page",
  host: { class: "block" },
  templateUrl: "./logs-page.component.html",
  standalone: true,
  imports: [SharedUiModule, TranslatePipe, PluralPipe, CommonModule, HlmButton, AppIconComponent],
})
export class LogsPageComponent implements OnInit {
  private readonly systemSettingsService = inject(SystemSettingsService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly levels = LOG_LEVEL_FILTERS;
  public readonly levelTabs = LOG_LEVEL_FILTERS.map((option) => ({ value: option.value || "all", label: option.label }));
  public readonly entries = signal<AppLogEntry[]>([]);
  public readonly level = signal("");
  public readonly loading = signal(true);

  public ngOnInit(): void {
    this.load();
  }

  public selectLevel(level: string): void {
    this.level.set(level);
    this.load();
  }

  public load(): void {
    this.loading.set(true);
    this.systemSettingsService
      .getAppLog(this.level() || undefined, 300)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (entries) => this.entries.set(entries),
        error: () => this.snackbarService.error("Could not load the log"),
      });
  }
}
