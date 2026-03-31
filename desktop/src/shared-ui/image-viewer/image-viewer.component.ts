import { Component, HostListener, Input, OnChanges, OnDestroy, SimpleChanges, input, output, signal } from "@angular/core";

@Component({
    selector: "app-image-viewer",
    templateUrl: "./image-viewer.component.html",
    styleUrl: "./image-viewer.component.scss",
    standalone: false
})
export class ImageViewerComponent implements OnChanges, OnDestroy {
  @HostListener("wheel", ["$event"])
  public onWheel(event: WheelEvent) {
    this.wheel.emit(event);
  }

  @Input() public imageBase64?: string = "";

  public readonly imageFile = input<File>();

  public readonly scale = input<number>(1);

  public readonly wheel = output<WheelEvent>();

  public imageFileUrl = signal("");

  private activeReader?: FileReader;

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes["imageFile"] && changes["imageFile"].currentValue) {
      this.setImageFileUrl(changes["imageFile"].currentValue);
    }
  }

  public ngOnDestroy(): void {
    this.activeReader?.abort();
  }

  private setImageFileUrl(file: File): void {
    this.activeReader?.abort();

    const reader = new FileReader();
    this.activeReader = reader;

    reader.onload = (event) => {
      this.imageFileUrl.set((event?.target?.result ?? "") as string);
    };

    reader.readAsDataURL(file);
  }
}


