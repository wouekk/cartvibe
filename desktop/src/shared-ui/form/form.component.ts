import { Component, TemplateRef, input, output } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { FormConfig } from "src/interfaces";

@Component({
    selector: "app-form",
    templateUrl: "./form.component.html",
    styleUrls: ["./form.component.scss"],
    standalone: false
})
export class FormComponent {
  public readonly formConfig = input.required<FormConfig>();

  public readonly form = input.required<FormGroup>();

  public readonly formTemplate = input.required<TemplateRef<any>>();

  public readonly editButtonRouterLink = input<string[]>([]);

  public readonly editButtonQueryParams = input<any>({});

  public readonly canEdit = input(true);

  public readonly bottomSpacing = input(false);

  public readonly submitButtonDisabled = input(false);

  public readonly submitted = output<void>();
}
