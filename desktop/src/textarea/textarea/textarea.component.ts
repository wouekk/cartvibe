import { Component, ElementRef, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { BaseInputComponent } from "../../base-input";
import { InputInterface } from "../../input";

@Component({
    selector: "app-textarea",
    templateUrl: "./textarea.component.html",
    styleUrls: ["./textarea.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TextareaComponent extends BaseInputComponent implements InputInterface {
  public readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>("nativeTextarea");
}
