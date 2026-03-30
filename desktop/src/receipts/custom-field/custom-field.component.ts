import { Component, input } from "@angular/core";
import { FormControl, FormGroup } from "@angular/forms";
import { CustomField, CustomFieldType } from "../../open-api/index";

@Component({
  selector: "app-custom-field",
  standalone: false,
  templateUrl: "./custom-field.component.html",
  styleUrl: "./custom-field.component.scss"
})
export class CustomFieldComponent {
  public readonly formGroup = input.required<FormGroup<{
    receiptId: FormControl<number>;
    customFieldId: FormControl<number>;
    stringValue: FormControl<string>;
    dateValue: FormControl<string>;
    selectValue: FormControl<number>;
    currencyValue: FormControl<number>;
    booleanValue: FormControl<boolean>;
}>>();

  public readonly customFields = input<CustomField[]>([]);

  public readonly readonly = input<boolean>(false);

  protected readonly CustomFieldType = CustomFieldType;
}
