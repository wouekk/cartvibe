import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, signal, viewChild } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { AppDialogRef } from "../dialog/app-dialog";
import { TranslatePipe } from "../i18n/translate.pipe";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { BarcodePhotoActionsComponent } from "./barcode-photo-actions.component";
import { BarcodeScannerService, canUseCamera, ScanHandle } from "./barcode-scanner.service";

export type ScannerState = "starting" | "scanning" | "denied" | "unavailable";

/**
 * A live camera view that closes with the barcode it reads (a string), or with nothing when it is dismissed. Every
 * camera track is stopped on every way out, so the browser's recording indicator never outlives the dialog.
 */
@Component({
  selector: "app-barcode-scanner-dialog",
  standalone: true,
  imports: [HlmButton, AppIconComponent, BarcodePhotoActionsComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 p-4" data-testid="barcode-scanner">
      <div class="flex items-center justify-between gap-2">
        <h2 class="m-0 text-base font-semibold">{{ 'Scan a barcode' | t }}</h2>
        <button hlmBtn variant="ghost" size="icon" type="button" data-testid="barcode-scanner-close" [attr.aria-label]="'Close' | t" (click)="close()">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-muted">
        <video #video class="size-full object-cover" playsinline muted></video>
        @if (state() === 'scanning') {
          <div class="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary/70"></div>
        }
      </div>

      @switch (state()) {
        @case ('starting') {
          <p class="m-0 text-sm text-muted-foreground" data-testid="barcode-scanner-starting">{{ 'Starting the camera…' | t }}</p>
        }
        @case ('scanning') {
          <p class="m-0 text-sm text-muted-foreground" data-testid="barcode-scanner-hint">{{ 'Point the camera at the barcode.' | t }}</p>
        }
        @case ('denied') {
          <p class="m-0 text-sm text-destructive" role="alert" data-testid="barcode-scanner-denied">
            {{ 'The camera is blocked. Allow it for this site in the browser, or type the barcode instead.' | t }}
          </p>
        }
        @default {
          <p class="m-0 text-sm text-destructive" role="alert" data-testid="barcode-scanner-unavailable">
            {{ 'No camera could be started. Type the barcode instead.' | t }}
          </p>
        }
      }

      @if (state() === 'denied' || state() === 'unavailable') {
        <app-barcode-photo-actions variant="bar" (barcodeFound)="found($event)" (notFound)="photoFailed.set(true)"></app-barcode-photo-actions>
        @if (photoFailed()) {
          <p class="m-0 text-sm text-destructive" role="alert" data-testid="barcode-scanner-photo-failed">
            {{ 'No barcode was found in that photo. Try again with the bars sharp and filling the frame.' | t }}
          </p>
        }
      }
    </div>
  `,
})
export class BarcodeScannerDialogComponent implements AfterViewInit, OnDestroy {
  private readonly dialogRef = inject<AppDialogRef<BarcodeScannerDialogComponent, string>>(AppDialogRef);
  private readonly scanner = inject(BarcodeScannerService);

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>("video");

  public readonly state = signal<ScannerState>("starting");
  public readonly photoFailed = signal(false);

  private stream: MediaStream | null = null;
  private handle: ScanHandle | null = null;
  private done = false;

  public async ngAfterViewInit(): Promise<void> {
    if (!canUseCamera()) {
      this.state.set("unavailable");

      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (this.done) {
        stream.getTracks().forEach((track) => track.stop());

        return;
      }
      this.stream = stream;

      const element = this.video().nativeElement;
      element.srcObject = stream;
      await element.play();

      this.handle = await this.scanner.start(stream, element, (code) => this.found(code));
      this.state.set("scanning");
    } catch (error) {
      this.release();
      const name = (error as { name?: string })?.name;
      this.state.set(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  }

  public ngOnDestroy(): void {
    this.done = true;
    this.release();
  }

  protected close(): void {
    this.dialogRef.close();
  }

  protected found(code: string): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.release();
    this.dialogRef.close(code);
  }

  private release(): void {
    this.handle?.stop();
    this.handle = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
