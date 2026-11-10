import { DecimalPipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { catchError, of, take } from "rxjs";
import { AiType } from "../../constants/ai-type";
import { TranslationService } from "../../i18n/translation.service";
import { AiUsageMonth, ReceiptProcessingSettingsService } from "../../open-api";
import { PipesModule } from "../../pipes/pipes.module";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { providerName } from "../ai-settings-shared";

interface UsageRow {
  key: string;
  month: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * What the AI was asked and what it wrote, this month and the one before: the reads and the tokens each provider
 * counted, per model. Providers bill by these numbers, so this is what a month of receipts used. It shows nothing
 * until something was read, and nothing at all when the numbers cannot be loaded (the page works without them).
 */
@Component({
  selector: "app-ai-usage-card",
  host: { class: "block" },
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, PipesModule, SharedUiModule],
  template: `
    @if (rows().length > 0) {
      <app-settings-section
        testId="ai-card-usage"
        title="Usage"
        description="What the AI was sent and what it wrote, as each provider counted it. Providers bill by these numbers."
      >
        <div class="cv-scroll-x">
          <table class="w-full text-sm" data-testid="ai-usage-table">
            <thead>
              <tr class="text-left text-xs text-muted-foreground">
                <th class="py-2 pr-4 font-medium">{{ 'Month' | t }}</th>
                <th class="py-2 pr-4 font-medium">{{ 'Model' | t }}</th>
                <th class="py-2 pr-4 text-right font-medium">{{ 'Reads' | t }}</th>
                <th class="py-2 pr-4 text-right font-medium">{{ 'Tokens sent' | t }}</th>
                <th class="py-2 text-right font-medium">{{ 'Tokens written' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.key) {
                <tr class="border-t border-border/40" data-testid="ai-usage-row">
                  <td class="py-2 pr-4">{{ row.month }}</td>
                  <td class="min-w-0 break-words py-2 pr-4">{{ row.model }}</td>
                  <td class="py-2 pr-4 text-right tabular-nums">{{ row.calls | number }}</td>
                  <td class="py-2 pr-4 text-right tabular-nums">{{ row.inputTokens | number }}</td>
                  <td class="py-2 text-right tabular-nums">{{ row.outputTokens | number }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </app-settings-section>
    }
  `,
})
export class AiUsageCardComponent implements OnInit {
  private readonly receiptProcessingSettingsService = inject(ReceiptProcessingSettingsService);
  private readonly translation = inject(TranslationService);

  private readonly usage = signal<AiUsageMonth[]>([]);

  public readonly rows = computed<UsageRow[]>(() =>
    this.usage().map((month) => ({
      key: `${month.month}|${month.aiType}|${month.model}`,
      month: this.monthLabel(month.month),
      model: `${providerName(month.aiType as AiType)} · ${month.model}`,
      calls: month.calls,
      inputTokens: month.inputTokens,
      outputTokens: month.outputTokens,
    }))
  );

  public ngOnInit(): void {
    this.receiptProcessingSettingsService
      .getAiUsage()
      .pipe(
        take(1),
        catchError(() => of([] as AiUsageMonth[]))
      )
      .subscribe((usage) => this.usage.set(usage ?? []));
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
