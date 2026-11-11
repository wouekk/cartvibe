import { Component, Input, TemplateRef, computed, input, output, ChangeDetectionStrategy, inject } from "@angular/core";
import { FormMode } from "src/enums/form-mode.enum";
import { LayoutStore } from "src/store/layout.store";
import { NgIf, NgTemplateOutlet } from "@angular/common";
import { CancelButtonComponent } from "../cancel-button/cancel-button.component";
import { SubmitButtonComponent } from "../submit-button/submit-button.component";

@Component({
    selector: "app-dialog-footer",
    templateUrl: "./dialog-footer.component.html",
    styleUrls: ["./dialog-footer.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgIf, NgTemplateOutlet, CancelButtonComponent, SubmitButtonComponent]
})
export class DialogFooterComponent {
  private readonly layoutStore = inject(LayoutStore);

  @Input() public additionalButtonsTemplate?: TemplateRef<any>;
  public readonly submitButtonTooltip = input<string>("Save");
  public readonly submitButtonType = input<"button" | "submit">("submit");
  // Red Save for a dialog whose action deletes or removes.
  public readonly submitDestructive = input<boolean>(false);
  public readonly disableWhenProgressBarIsShown = input<boolean>(false);
  // Dims and blocks Save while the dialog has nothing to submit (an import with no row ticked).
  public readonly submitDisabled = input<boolean>(false);
  // Set when the dialog edits something that exists: Save is then dimmed while the form is unchanged.
  public readonly editing = input<boolean>(false);
  public readonly submitMode = computed(() => (this.editing() ? FormMode.edit : undefined));
  public readonly cancelClicked = output<void>();
  public readonly submitClicked = output<void>();

  public showProgressBar = this.layoutStore.showProgressBar;

}
