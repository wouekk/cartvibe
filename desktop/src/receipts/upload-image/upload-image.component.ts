import { Component, input, output, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { take, tap } from "rxjs";
import { FormMode } from "src/enums/form-mode.enum";
import { ReceiptFileUploadCommand } from "../../interfaces";
import { ReceiptImageService } from "../../open-api";
import { downscaleImageForUpload } from "../../utils/downscale-image";

@Component({
    selector: "app-upload-image",
    templateUrl: "./upload-image.component.html",
    styleUrls: ["./upload-image.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class UploadImageComponent {
  readonly uploadInput = viewChild.required<any>("uploadInput");

  public readonly receiptId = input<string | undefined>("");

  public readonly multiple = input<boolean>(true);

  public readonly acceptFileTypes = input<string[]>([
    "image/*",
    "application/pdf",
    "image/heic",
    "image/heif",
]);

  public readonly fileLoaded = output<ReceiptFileUploadCommand>();

  public formMode = FormMode;
  
  constructor(private receiptImageService: ReceiptImageService) {}

  public clickInput(): void {
    this.uploadInput().nativeElement.click();
  }

  public async onFileChange(event: any): Promise<void> {
    const files: File[] = Array.from(event?.target?.files ?? []);
    await this.processFiles(files);
    // Clearing the input lets the same photo be picked again after it was removed.
    if (event?.target) {
      event.target.value = "";
    }
  }

  /** Accepts files from the picker or from a drop: keeps the allowed types and emits each one as it is ready. */
  public async processFiles(files: File[]): Promise<void> {
    const acceptedFiles = files.filter((f) =>
      this.acceptFileTypes().some((t) => new RegExp(t).test(f.type))
    );

    for (let i = 0; i < acceptedFiles.length; i++) {
      const reader = new FileReader();
      // A phone photo goes up as a smaller JPEG; anything it cannot shrink stays as picked.
      const f = await downscaleImageForUpload(acceptedFiles[i]);

      reader.onload = () => {
        const command: ReceiptFileUploadCommand = {
          file: f,
          receiptId: Number(this.receiptId()),
        };

        if (f.type === "application/pdf" || f.type === "image/heic" || f.type === "image/heif") {
          this.receiptImageService
            .convertToJpg(f)
            .pipe(
              take(1),
              tap((encodedImage) => {
                command.encodedImage = encodedImage.encodedImage;
                this.fileLoaded.emit(command);
              })
            )
            .subscribe();
        } else {
          this.fileLoaded.emit(command);
        }
      };

      reader.readAsArrayBuffer(f);
    }
  }
}
