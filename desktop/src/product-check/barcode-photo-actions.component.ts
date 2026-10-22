import { ChangeDetectionStrategy, Component, inject, input, output, signal } from "@angular/core";
import { buttonVariants } from "@spartan-ng/helm/button";
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../i18n/translate.pipe";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { BarcodeImageService } from "./barcode-image.service";

/**
 * Reads a barcode from a photo: "Take a photo of the code" opens the phone's own camera, "Upload a photo" picks an existing
 * picture. It is what stands in for the live scanner where the browser offers no live video (plain http) or refuses it.
 *
 * Each button is a native `<label>` around a hidden file input, never a button that calls `input.click()`: iOS Safari and
 * Android Chrome only open a file picker or the camera from a synchronous tap on the control itself, and a click made
 * after an `await` (say, after `getUserMedia` failed) is silently dropped.
 *
 * `variant="bar"` is the labelled pair, `variant="icon"` a single camera icon for inside an input bar.
 */
@Component({
  selector: "app-barcode-photo-actions",
  standalone: true,
  imports: [HlmSpinnerImports, AppIconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    @if (variant() === 'icon') {
      <label
        class="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-within:ring-3 focus-within:ring-ring/40"
        [class.pointer-events-none]="decoding()"
        [attr.title]="'Take a photo of the code' | t"
        data-testid="barcode-photo-icon"
      >
        <input type="file" accept="image/*" capture="environment" class="sr-only" data-testid="barcode-photo-capture" [attr.aria-label]="'Take a photo of the code' | t" (change)="selected($event)" />
        @if (decoding()) {
          <hlm-spinner class="animate-spin" [attr.aria-label]="'Reading the barcode…' | t" />
        } @else {
          <app-icon name="photo_camera"></app-icon>
        }
      </label>
    } @else {
      <div class="flex flex-col gap-2" data-testid="barcode-photo-bar">
        <div class="grid grid-cols-2 gap-2">
          <label [class]="photoButtonClass" class="cursor-pointer focus-within:ring-3 focus-within:ring-ring/50" [class.pointer-events-none]="decoding()" [class.opacity-50]="decoding()">
            <input type="file" accept="image/*" capture="environment" class="sr-only" data-testid="barcode-photo-capture" (change)="selected($event)" />
            <app-icon name="photo_camera"></app-icon>
            <span>{{ 'Take a photo of the code' | t }}</span>
          </label>
          <label [class]="photoButtonClass" class="cursor-pointer focus-within:ring-3 focus-within:ring-ring/50" [class.pointer-events-none]="decoding()" [class.opacity-50]="decoding()">
            <input type="file" accept="image/*" class="sr-only" data-testid="barcode-photo-upload" (change)="selected($event)" />
            <app-icon name="image"></app-icon>
            <span>{{ 'Upload a photo' | t }}</span>
          </label>
        </div>
      </div>
    }

    @if (decoding() && variant() === 'bar') {
      <p class="m-0 mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="barcode-photo-decoding">
        <hlm-spinner class="animate-spin" /> {{ 'Reading the barcode…' | t }}
      </p>
    }
  `,
})
export class BarcodePhotoActionsComponent {
  private readonly decoder = inject(BarcodeImageService);

  public readonly variant = input<"bar" | "icon">("bar");

  /** The labels look like the app's primary button; they stay labels for the reason above. */
  protected readonly photoButtonClass = buttonVariants({ variant: "default" });

  /** The barcode read from the photo. */
  public readonly barcodeFound = output<string>();

  /** True while a photo is being decoded. */
  public readonly decoding = signal(false);

  /** Emitted when a photo gave nothing; the host says so (the labels stay usable to try again). */
  public readonly notFound = output<void>();

  protected async selected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so choosing the same picture again (after a retake) still fires a change.
    const reset = () => (input.value = "");
    if (!file) {
      return;
    }

    this.decoding.set(true);
    try {
      const code = await this.decoder.decode(file);
      if (code) {
        this.barcodeFound.emit(code);
      } else {
        this.notFound.emit();
      }
    } finally {
      this.decoding.set(false);
      reset();
    }
  }
}
