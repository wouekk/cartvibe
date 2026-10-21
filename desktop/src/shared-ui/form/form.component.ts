import { Component, TemplateRef, input, output } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { FormConfig } from "src/interfaces";

@Component({
    selector: "app-form",
    templateUrl: "./form.component.html",
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

  /** Draws the form as one settings card (title, Edit action in the head, submit in the footer) instead of a bare form. */
  public readonly settingsCard = input(false);

  public readonly submitButtonDisabled = input(false);

  public readonly submitted = output<void>();
}
