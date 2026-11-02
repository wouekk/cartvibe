import { Component, TemplateRef, computed, input, output, ChangeDetectionStrategy } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { FormMode } from "src/enums/form-mode.enum";
import { FormConfig } from "src/interfaces";

@Component({
    selector: "app-form",
    templateUrl: "./form.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
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

  /** Card title in `settingsCard` mode; defaults to the form header text. */
  public readonly settingsTitle = input<string>("");

  public readonly submitButtonDisabled = input(false);

  /** Editing a saved record (not adding one): its Save wears the unsaved-changes halo once the form changes. */
  public readonly editing = computed(() => this.formConfig().mode === FormMode.edit);

  public readonly submitted = output<void>();
}
