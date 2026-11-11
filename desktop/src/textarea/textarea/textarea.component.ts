import { Component, ElementRef, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { BaseInputComponent } from "../../base-input";
import { InputInterface } from "../../input";
import { CdkTextareaAutosize } from "@angular/cdk/text-field";
import { ReactiveFormsModule } from "@angular/forms";
import { BrnFieldControl, BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { BrnTextarea } from "@spartan-ng/brain/textarea";
import { HlmTextarea } from "../../ui/textarea/lib/hlm-textarea";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { AsyncPipe } from "@angular/common";

@Component({
    selector: "app-textarea",
    templateUrl: "./textarea.component.html",
    styleUrls: ["./textarea.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [CdkTextareaAutosize, ReactiveFormsModule, BrnFieldControl, BrnTextarea, BrnFieldControlDescribedBy, HlmTextarea, TranslatePipe, AsyncPipe]
})
export class TextareaComponent extends BaseInputComponent implements InputInterface {
  public readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>("nativeTextarea");

  private static nextId = 0;

  /** Unique per field, so two textareas on one page keep their own label association (a shared id points both at the first). */
  public readonly fieldId = `app-textarea-${TextareaComponent.nextId++}`;
}
