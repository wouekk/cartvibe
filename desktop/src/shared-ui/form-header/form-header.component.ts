import { Location, NgIf, NgTemplateOutlet } from "@angular/common";
import { Component, Input, TemplateRef, input, ChangeDetectionStrategy } from "@angular/core";
import { AppIconComponent } from "../icon/icon.component";
import { TranslatePipe, TranslateDataPipe } from "../../i18n/translate.pipe";

@Component({
    selector: "app-form-header",
    templateUrl: "./form-header.component.html",
    styleUrls: ["./form-header.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [AppIconComponent, NgIf, NgTemplateOutlet, TranslatePipe, TranslateDataPipe]
})
export class FormHeaderComponent {
  public readonly headerText = input<string>("");

  @Input() public headerButtonsTemplate?: TemplateRef<any>;

  public readonly bottomSpacing = input<boolean>(false);

  public readonly displayBackButton = input<boolean>(true);

  constructor(private location: Location) {}

  public navigateBack(): void {
    this.location.back();
  }
}
