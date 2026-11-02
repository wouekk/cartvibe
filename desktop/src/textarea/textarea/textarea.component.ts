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

  private static nextId = 0;

  /** Unique per field, so two textareas on one page keep their own label association (a shared id points both at the first). */
  public readonly fieldId = `app-textarea-${TextareaComponent.nextId++}`;
}
