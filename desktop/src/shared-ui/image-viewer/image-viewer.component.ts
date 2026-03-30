import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges } from "@angular/core";

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

  @Input() public imageFile?: File;

  @Input() public scale: number = 1;

  @Output() public wheel: EventEmitter<WheelEvent> = new EventEmitter<WheelEvent>();

  public imageFileUrl: string = "";

  private activeReader?: FileReader;

  constructor(private cdr: ChangeDetectorRef) {}

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
      this.imageFileUrl = (event?.target?.result ?? "") as string;
      this.cdr.detectChanges();
    };

    reader.readAsDataURL(file);
  }
}


