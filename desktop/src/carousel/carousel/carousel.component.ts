import { Component, OnChanges, SimpleChanges, ViewEncapsulation, input, output } from "@angular/core";
import { UntilDestroy } from "@ngneat/until-destroy";
import { FormMode } from "src/enums/form-mode.enum";
import { ReceiptFileUploadCommand } from "../../interfaces";
import { FileDataView } from "../../open-api";

@UntilDestroy()
@Component({
    selector: "app-carousel",
    templateUrl: "./carousel.component.html",
    styleUrls: ["./carousel.component.scss"],
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class CarouselComponent implements OnChanges {
  public readonly images = input<FileDataView[]>([]);

  public readonly imagePreviews = input<ReceiptFileUploadCommand[]>([]);

  public readonly disabled = input<boolean>(false);

  public readonly mode = input.required<FormMode>();

  public readonly hideButtonControls = input<boolean>(false);

  public readonly initialIndex = input<number>(-1);

  public readonly removeButtonClicked = output<number>();

  public scale: number = 1;

  public currentlyShownImageIndex: number = 0;

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes["initialIndex"]) {
      this.currentlyShownImageIndex = this.initialIndex();
    }
  }

  public emitRemoveButtonClicked(index: number): void {
    this.removeButtonClicked.emit(index);
  }

  public zoomOut() {
    this.adjustScale(-0.1);
  }

  public zoomIn() {
    this.adjustScale(0.1);
  }

  public onScroll(event: WheelEvent): void {
    event.preventDefault();
    let value = event.deltaY * -0.000001;
    this.adjustScale(value);
  }

  public updateCurrentlyShownImage(index: number): void {
    this.currentlyShownImageIndex = index;
  }

  public adjustScale(amount: number): void {
    const newScale = this.scale + amount;
    this.scale = Math.max(newScale, 0.1);
  }
}
