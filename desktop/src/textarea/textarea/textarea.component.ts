import { Component, ElementRef, viewChild } from "@angular/core";
import { BaseInputComponent } from "../../base-input";
import { InputInterface } from "../../input";

@Component({
    selector: "app-textarea",
    templateUrl: "./textarea.component.html",
    styleUrls: ["./textarea.component.scss"],
    standalone: false
})
export class TextareaComponent extends BaseInputComponent implements InputInterface {
  public readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>("nativeTextarea");
}
