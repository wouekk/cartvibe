import { DecimalPipe } from "@angular/common";
import { HttpContext } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from "@angular/core";
import { catchError, of, take } from "rxjs";
import { AiType } from "../../constants/ai-type";
import { TranslationService } from "../../i18n/translation.service";
import { QUIET_ERRORS } from "../../interceptors/http-interceptor";
import { AiUsageMonth, ReceiptProcessingSettingsService } from "../../open-api";
import { ViewportService } from "../../services/viewport.service";

import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { HlmTable, HlmTBody, HlmTd, HlmTh, HlmTHead, HlmTr } from "../../ui/table/lib/hlm-table";
import { providerName } from "../ai-settings-shared";
import { TranslatePipe } from "../../i18n/translate.pipe";

interface UsageRow {
  key: string;
  month: string;
  model: string;
  /** The model the main AI is set to now, in the running month. */
  inUse: boolean;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/** The provider and model the main AI is saved with: what the next read will use. */
export interface AiModelInUse {
  aiType?: string;
  model?: string;
}

/**
 * What the AI was asked and what it wrote, this month and the one before: the reads and the tokens each provider
 * counted, per model. Providers bill by these numbers, so this is what a month of receipts used. The model the main
 * AI is set to has a row in the running month from the moment it is saved, with zeros until it has answered, so a
 * change of model shows here at once. The card shows nothing while no AI is set up and nothing was read, and nothing
 * at all when the numbers cannot be loaded (the page works without them). On a phone each row is a card, like
 * every table.
 */
@Component({
  selector: "app-ai-usage-card",
  host: { class: "block" },
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, TranslatePipe, SharedUiModule, HlmTable, HlmTHead, HlmTBody, HlmTr, HlmTh, HlmTd],
  template: `
    @if (rows().length > 0) {
      <app-settings-section
        testId="ai-card-usage"
        title="Usage"
        description="What the AI was sent and what it wrote, as each provider counted it. Providers bill by these numbers."
      >
        @if (cards()) {
          <ul class="m-0 mt-3 list-none p-0 text-sm" data-testid="ai-usage-cards">
            @for (row of rows(); track row.key) {
              <li class="border-t border-border px-6 py-3" data-testid="ai-usage-row" [attr.data-in-use]="row.inUse ? '' : null">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="min-w-0 font-medium break-all">{{ row.model }}</span>
                  @if (row.inUse) {
                    <app-status-chip data-testid="ai-usage-in-use" [customStatus]="'In use' | t" customStatusColor="green"></app-status-chip>
                  }
                </div>
                <div class="text-[0.8125rem] text-muted-foreground">{{ row.month }}</div>
                <dl class="m-0 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
                  <div class="flex items-center gap-1.5">
                    <dt class="text-muted-foreground">{{ 'Reads' | t }}</dt>
                    <dd class="m-0 font-medium">{{ row.calls | number }}</dd>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <dt class="text-muted-foreground">{{ 'Tokens sent' | t }}</dt>
                    <dd class="m-0 font-medium">{{ row.inputTokens | number }}</dd>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <dt class="text-muted-foreground">{{ 'Tokens written' | t }}</dt>
                    <dd class="m-0 font-medium">{{ row.outputTokens | number }}</dd>
                  </div>
                </dl>
              </li>
            }
          </ul>
        } @else {
        <div class="cv-card__table cv-scroll-x">
          <table hlmTable data-testid="ai-usage-table">
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh scope="col">{{ 'Month' | t }}</th>
                <th hlmTh scope="col">{{ 'Model' | t }}</th>
                <th hlmTh scope="col" class="text-right">{{ 'Reads' | t }}</th>
                <th hlmTh scope="col" class="text-right">{{ 'Tokens sent' | t }}</th>
                <th hlmTh scope="col" class="text-right">{{ 'Tokens written' | t }}</th>
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (row of rows(); track row.key) {
                <tr hlmTr data-testid="ai-usage-row" [attr.data-in-use]="row.inUse ? '' : null">
                  <td hlmTd class="py-3">{{ row.month }}</td>
                  <td hlmTd class="py-3 whitespace-normal">
                    <span class="inline-flex flex-wrap items-center gap-2">
                      <span class="min-w-0 font-medium break-all">{{ row.model }}</span>
                      @if (row.inUse) {
                        <app-status-chip data-testid="ai-usage-in-use" [customStatus]="'In use' | t" customStatusColor="green"></app-status-chip>
                      }
                    </span>
                  </td>
                  <td hlmTd class="py-3 text-right tabular-nums">{{ row.calls | number }}</td>
                  <td hlmTd class="py-3 text-right tabular-nums">{{ row.inputTokens | number }}</td>
                  <td hlmTd class="py-3 text-right tabular-nums">{{ row.outputTokens | number }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        }
      </app-settings-section>
    }
  `,
})
export class AiUsageCardComponent implements OnInit {
  private readonly receiptProcessingSettingsService = inject(ReceiptProcessingSettingsService);
  private readonly translation = inject(TranslationService);

  /** A phone shows each row as a card instead of a table that scrolls sideways. */
  protected readonly cards = inject(ViewportService).isHandset;

  /** What the main AI is saved with; undefined while none is. */
  public readonly inUse = input<AiModelInUse | undefined>(undefined);

  private readonly usage = signal<AiUsageMonth[]>([]);

  public readonly rows = computed<UsageRow[]>(() => {
    const inUse = this.inUse();
    const usage = this.usage();
    // The server keeps its days in UTC, so the running month is UTC's.
    const thisMonth = new Date().toISOString().slice(0, 7);
    const isInUse = (month: AiUsageMonth): boolean =>
      !!inUse?.model && month.month === thisMonth && month.aiType === inUse.aiType && month.model === inUse.model;

    const months =
      inUse?.aiType && inUse.model && !usage.some(isInUse)
        ? [{ month: thisMonth, aiType: inUse.aiType, model: inUse.model, calls: 0, inputTokens: 0, outputTokens: 0 }, ...usage]
        : usage;

    return months.map((month) => ({
      key: `${month.month}|${month.aiType}|${month.model}`,
      month: this.monthLabel(month.month),
      model: `${providerName(month.aiType as AiType)} · ${month.model}`,
      inUse: isInUse(month),
      calls: month.calls,
      inputTokens: month.inputTokens,
      outputTokens: month.outputTokens,
    }));
  });

  public ngOnInit(): void {
    this.reload();
  }

  /** Reads the numbers again: after a save or a test on the page, and when the scan queue has read something. */
  public reload(): void {
    this.receiptProcessingSettingsService
      .getAiUsage("body", false, { context: new HttpContext().set(QUIET_ERRORS, true) })
      .pipe(
        take(1),
        // What was shown stays when a later read of the numbers fails.
        catchError(() => of(undefined))
      )
      .subscribe((usage) => {
        if (usage) {
          this.usage.set(usage);
        }
      });
  }

  /** "2026-11" as "November 2026", in the person's language. */
  private monthLabel(month: string): string {
    const [year, monthNumber] = month.split("-").map(Number);
    if (!year || !monthNumber) {
      return month;
    }
    const name = new Date(year, monthNumber - 1, 1).toLocaleString("en", { month: "long" });
    return this.translation.months(`${name} ${year}`);
  }
}
