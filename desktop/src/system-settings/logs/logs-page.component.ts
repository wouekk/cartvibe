import { CommonModule } from "@angular/common";
import { Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { finalize } from "rxjs";
import { AppLogEntry, SystemSettingsService } from "../../open-api";
import { SnackbarService } from "../../services";

/** The level filters on offer; an empty value is "everything". */
export const LOG_LEVEL_FILTERS = [
  { label: "All", value: "" },
  { label: "Errors", value: "ERROR" },
  { label: "Info", value: "INFO" },
];

/**
 * The admin's Logs tab (Phase 3 M2): the newest lines of the application log, newest first, with a
 * level filter and a refresh. Read-only; the API gates it like System Settings.
 */
@Component({
  selector: "app-logs-page",
  templateUrl: "./logs-page.component.html",
  styleUrls: ["./logs-page.component.scss"],
  standalone: true,
  imports: [CommonModule, MatButtonModule, AppIconComponent],
})
export class LogsPageComponent implements OnInit {
  private readonly systemSettingsService = inject(SystemSettingsService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly levels = LOG_LEVEL_FILTERS;
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
