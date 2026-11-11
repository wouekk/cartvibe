import { Component, Input, TemplateRef, input, ChangeDetectionStrategy } from "@angular/core";
import { NgIf, NgTemplateOutlet } from "@angular/common";
import { TranslateDataPipe } from "../../i18n/translate.pipe";

@Component({
    selector: "app-dialog",
    templateUrl: "./dialog.component.html",
    styleUrls: ["./dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgIf, NgTemplateOutlet, TranslateDataPipe]
})
export class DialogComponent {
  public readonly headerText = input<string>("");

  @Input() public actionsTemplate?: TemplateRef<any>;
}
