import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { UploadStage } from "../../utils/upload-progress";
import { marker } from "../../i18n/marker";

/**
 * A quiet upload bar: a hairline track with a fill in the primary token, so it is black on the White theme and white on
 * the Black one, and a small tabular label ("Uploading 42%", then "Saving…"). It renders nothing while idle (`stage` null).
 */
@Component({
  selector: "app-upload-progress",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: { class: "block" },
  template: `
    @if (stage(); as current) {
      <div class="flex flex-col gap-1.5" data-testid="upload-progress">
        <div
          class="h-1.5 w-full overflow-hidden rounded-full bg-primary/15"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-valuenow]="current.stage === 'uploading' ? current.percent : null"
          [attr.aria-label]="'Uploading' | t"
        >
          <div
            class="h-full rounded-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
            [class.animate-pulse]="current.stage === 'saving'"
            [style.width.%]="width()"
            data-testid="upload-progress-fill"
          ></div>
        </div>
        <p class="m-0 text-xs tabular-nums text-muted-foreground" data-testid="upload-progress-label">{{ label() | t: { percent: percent() } }}</p>
      </div>
    }
  `,
})
export class UploadProgressComponent {
  public readonly stage = input<UploadStage | null>(null);

  protected readonly percent = computed(() => {
    const current = this.stage();
    return current?.stage === "uploading" ? current.percent : 100;
  });

  protected readonly width = computed(() => this.percent());

  protected readonly label = computed(() => (this.stage()?.stage === "saving" ? marker("Saving…") : marker("Uploading {percent}%")));
}
