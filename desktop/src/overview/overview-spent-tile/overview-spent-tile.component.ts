import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal, viewChild } from "@angular/core";
import { RouterLink } from "@angular/router";
import { catchError, of, take, tap } from "rxjs";
import { marker } from "../../i18n/marker";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { TranslationService } from "../../i18n/translation.service";
import { GroupOverview, Permission, UserPreferences, UserPreferencesService } from "../../open-api";
import { DisplayCurrencyPipe } from "../../pipes/display-currency.pipe";
import { SnackbarService } from "../../services";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { MoneyComponent } from "../../shared-ui/money/money.component";
import { AuthStore } from "../../store";
import { parseInlineGoalInput } from "../overview-chart.utils";
import { isWholeCalendarMonth, ResolvedPeriod } from "../overview-period";

/**
 * The Dashboard's "Spent" tile: the period's total, and under it the monthly goal (a thin bar and what is left or
 * over) while one whole calendar month is shown, else the change against the period before. The whole tile opens
 * the receipts of the period.
 *
 * Someone who may update their preferences sets, changes or removes the goal right here: the editor, its draft
 * and the save are the tile's own business. The goal itself comes from the page, which other panels read it from.
 *
 * The tile is the host element, so the page can place it with ordinary layout classes.
 */
@Component({
  selector: "div[app-overview-spent-tile]",
  standalone: true,
  imports: [AppIconComponent, DisplayCurrencyPipe, MoneyComponent, RouterLink, TranslatePipe],
  templateUrl: "./overview-spent-tile.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: "cv-tile cv-tile-link relative", "data-testid": "overview-tile-spent" },
})
export class OverviewSpentTileComponent {
  private readonly authStore = inject(AuthStore);

  private readonly userPreferencesService = inject(UserPreferencesService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translation = inject(TranslationService);

  /** What the page loaded for the period; undefined while loading, null when the request failed. */
  public readonly overview = input<GroupOverview | null | undefined>();

  /** The period shown: the goal is compared with one whole calendar month only. */
  public readonly period = input<ResolvedPeriod | undefined>();

  /** The period in words, shown when there is neither a goal nor a change to show. */
  public readonly periodLabel = input.required<string>();

  /** The monthly spending goal from the user's settings; 0 when none is set. */
  public readonly goal = input(0);

  /** The total against the period before, in words. */
  public readonly change = input<string | undefined>();

  /** Spending went up, which the tile shows in the warning colour. */
  public readonly changeIsIncrease = input(false);

  /** The household whose receipts the tile opens. */
  public readonly groupId = input.required<number>();

  /** The receipts list opened from the tile starts on the period on show. */
  public readonly receiptsQuery = input<{ from?: string; to?: string }>({});

  /** The tile compares with the goal only while one whole calendar month is shown. */
  public readonly spentGoal = computed(() => {
    const goal = this.goal();
    const overview = this.overview();
    const period = this.period();
    if (!(goal > 0) || !overview || !isWholeCalendarMonth(period?.from, period?.to)) {
      return undefined;
    }

    const spent = Number(overview.total);
    return { goal, over: Math.max(0, spent - goal), remaining: Math.max(0, goal - spent) };
  });

  /** How full the tile's thin bar is: what was spent against the goal, at most all of it. */
  public readonly goalProgress = computed(() => {
    const goal = this.spentGoal();
    if (!goal) {
      return 0;
    }

    const spent = Number(this.overview()?.total ?? 0);
    return Math.min(100, Math.max(0, (spent / goal.goal) * 100));
  });

  // The goal can be set straight from the tile (no trip to User Settings).
  public readonly canEditGoal = computed(() => this.authStore.hasAppPermission(Permission.AppUserPreferencesUpdate));
  public readonly editingGoal = signal(false);
  public readonly goalDraft = signal("");
  private readonly userPreferences = this.authStore.userPreferences;
  private readonly goalInput = viewChild<ElementRef<HTMLInputElement>>("goalInput");
  private savingGoal = false;

  constructor() {
    // Imperative side effect: a goal editor that just opened takes the keyboard, with its text selected.
    effect(() => {
      const input = this.goalInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  public startEditingGoal(): void {
    const goal = this.goal();
    this.goalDraft.set(goal > 0 ? String(goal).replace(".", ",") : "");
    this.editingGoal.set(true);
  }

  public cancelEditingGoal(): void {
    this.editingGoal.set(false);
  }

  /** Saves the typed goal (Enter or leaving the field); empty or 0 removes it. */
  public saveGoal(): void {
    if (!this.editingGoal() || this.savingGoal) {
      return;
    }

    const parsed = parseInlineGoalInput(this.goalDraft());
    if (!parsed.ok) {
      this.snackbarService.error(this.translation.t("The monthly spending goal must be an amount above 0, like 1500,00."));
      return;
    }

    this.editingGoal.set(false);
    const current = this.userPreferences();
    if ((parsed.value ?? "") === (current?.monthlySpendingGoal ?? "") || (parsed.value === undefined && !(this.goal() > 0))) {
      return;
    }

    // The update replaces the whole preferences object, so everything else is sent back unchanged.
    const updated = { ...current, monthlySpendingGoal: parsed.value } as UserPreferences;
    this.savingGoal = true;
    this.userPreferencesService
      .updateUserPreferences(updated)
      .pipe(
        take(1),
        tap((saved) => {
          this.authStore.setUserPreferences(saved);
          this.snackbarService.success(parsed.value ? marker("Monthly goal saved") : marker("Monthly goal removed"));
        }),
        catchError(() => of(undefined))
      )
      .subscribe({ complete: () => (this.savingGoal = false) });
  }
}
