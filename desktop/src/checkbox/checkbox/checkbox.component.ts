import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { BaseInputInterface } from "../../base-input";
import { BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { HlmCheckbox } from "../../ui/checkbox/lib/hlm-checkbox";
import { HelpIconComponent } from "../../shared-ui/help-icon/help-icon.component";
import { TranslatePipe } from "../../i18n/translate.pipe";

@Component({
    selector: "app-checkbox",
    templateUrl: "./checkbox.component.html",
    styleUrls: ["./checkbox.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [BrnFieldControlDescribedBy, HlmCheckbox, ReactiveFormsModule, HelpIconComponent, TranslatePipe]
})
export class CheckboxComponent implements BaseInputInterface {
  @Input() public inputFormControl: FormControl<any> = new FormControl();

  @Input() public label: string = "";

  @Input() public additionalErrorMessages?:
    | { [key: string]: string }
    | undefined;

  @Input() public readonly: boolean = false;

  @Input() public placeholder?: string | undefined;

  @Input() public helpText?: string;

  public handleKeydown(event: KeyboardEvent): void {
    if (this.readonly) {
      event.preventDefault();
      return;
    }
  }
}
