import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, signal, viewChild } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { AppDialogRef } from "../dialog/app-dialog";
import { TranslatePipe } from "../i18n/translate.pipe";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { BarcodePhotoActionsComponent } from "./barcode-photo-actions.component";
import { BarcodeScannerService, canUseCamera, ScanHandle } from "./barcode-scanner.service";
import { pickMainCameraId } from "./main-camera";
import { SCAN_FRAME } from "./scan-frame";

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
          <!-- The scan frame: the shadow dims everything outside it, the brackets are where the barcode goes. -->
          <div
            class="pointer-events-none absolute flex justify-between shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)]"
            data-testid="barcode-scanner-frame"
            [style.left.%]="frame.x * 100"
            [style.top.%]="frame.y * 100"
            [style.width.%]="frame.width * 100"
            [style.height.%]="frame.height * 100"
          >
            <span class="h-full w-6 rounded-l-lg border-y-4 border-l-4 border-primary"></span>
            <span class="h-full w-6 rounded-r-lg border-y-4 border-r-4 border-primary"></span>
            <span class="absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary/70"></span>
          </div>
        }
      </div>

      @switch (state()) {
        @case ('starting') {
          <p class="m-0 text-sm text-muted-foreground" data-testid="barcode-scanner-starting">{{ 'Starting the camera…' | t }}</p>
        }
        @case ('scanning') {
          <!-- No hint: the brackets say it. The case stays so that scanning does not fall through to the error below. -->
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
        <app-barcode-photo-actions (barcodeFound)="found($event)" (notFound)="photoFailed.set(true)"></app-barcode-photo-actions>
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
  protected readonly frame = SCAN_FRAME;

  private stream: MediaStream | null = null;
  private handle: ScanHandle | null = null;
  private done = false;

  public async ngAfterViewInit(): Promise<void> {
    if (!canUseCamera()) {
      this.state.set("unavailable");

      return;
    }

    try {
      const stream = await this.openMainCamera();
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

  /**
   * The back camera, pinned to its main lens. The first request only lets the browser pick a back camera (and gives the
   * permission that makes device labels readable); when that is a virtual camera that hops between lenses, the stream is
   * reopened on the single main lens. Any failure of the second step keeps the first stream.
   */
  private async openMainCamera(): Promise<MediaStream> {
    const first = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });

    try {
      const mainId = pickMainCameraId(await navigator.mediaDevices.enumerateDevices());
      if (!mainId || first.getVideoTracks()[0]?.getSettings().deviceId === mainId) {
        return first;
      }
      const main = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: mainId } }, audio: false });
      first.getTracks().forEach((track) => track.stop());

      return main;
    } catch {
      return first;
    }
  }

  private release(): void {
    this.handle?.stop();
    this.handle = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
