import { ChangeDetectionStrategy, Component, inject, input, output, signal } from "@angular/core";
import { buttonVariants } from "@spartan-ng/helm/button";
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner";
import { TranslatePipe } from "../i18n/translate.pipe";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { BarcodeImageService } from "./barcode-image.service";

/**
 * The two ways to read a barcode from a picture, side by side: "Take a photo of the code" and "Upload a photo".
 *
 * Without live video (plain http, no device, a refused camera) "Take a photo" opens the phone's own camera app. Each of
 * those buttons is a native `<label>` around a hidden file input, never a button that calls `input.click()`: iOS Safari
 * and Android Chrome only open a file picker or the camera from a synchronous tap on the control itself, and a click
 * made after an `await` (say, after `getUserMedia` failed) is silently dropped.
 *
 * With `liveCamera` the first button is a plain button that emits `takePhoto`, and the host opens the live scanner.
 */
@Component({
  selector: "app-barcode-photo-actions",
  standalone: true,
  imports: [HlmSpinnerImports, AppIconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <div class="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2" data-testid="barcode-photo-bar">
      @if (liveCamera()) {
        <button type="button" [class]="photoButtonClass" [disabled]="decoding()" data-testid="barcode-photo-live" (click)="takePhoto.emit()">
          <app-icon name="photo_camera"></app-icon>
          <span>{{ 'Take a photo of the code' | t }}</span>
        </button>
      } @else {
        <label [class]="photoButtonClass" class="cursor-pointer focus-within:ring-3 focus-within:ring-ring/50" [class.pointer-events-none]="decoding()" [class.opacity-50]="decoding()">
          <input type="file" accept="image/*" capture="environment" class="sr-only" data-testid="barcode-photo-capture" (change)="selected($event)" />
          <app-icon name="photo_camera"></app-icon>
          <span>{{ 'Take a photo of the code' | t }}</span>
        </label>
      }
      <label [class]="photoButtonClass" class="cursor-pointer focus-within:ring-3 focus-within:ring-ring/50" [class.pointer-events-none]="decoding()" [class.opacity-50]="decoding()">
        <input type="file" accept="image/*" class="sr-only" data-testid="barcode-photo-upload" (change)="selected($event)" />
        <app-icon name="image"></app-icon>
        <span>{{ 'Upload a photo' | t }}</span>
      </label>
    </div>

    @if (decoding()) {
      <p class="m-0 mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="barcode-photo-decoding">
        <hlm-spinner class="animate-spin" /> {{ 'Reading the barcode…' | t }}
      </p>
    }
  `,
})
export class BarcodePhotoActionsComponent {
  private readonly decoder = inject(BarcodeImageService);

  /** True when the browser offers live video: "Take a photo" then asks the host to open the live scanner. */
  public readonly liveCamera = input(false);

  /** The labels look like the app's primary button; they stay labels for the reason above. */
  protected readonly photoButtonClass = buttonVariants({ variant: "default" });

  /** The barcode read from the photo. */
  public readonly barcodeFound = output<string>();

  /** "Take a photo" was pressed while live video is available. */
  public readonly takePhoto = output<void>();

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
