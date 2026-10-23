import { Component, Input, TemplateRef, computed, input, output, ChangeDetectionStrategy } from "@angular/core";
import { Store } from "@ngxs/store";
import { FormMode } from "src/enums/form-mode.enum";
import { LayoutState } from "src/store/layout.state";

@Component({
    selector: "app-dialog-footer",
    templateUrl: "./dialog-footer.component.html",
    styleUrls: ["./dialog-footer.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class DialogFooterComponent {
  @Input() public additionalButtonsTemplate?: TemplateRef<any>;
  public readonly submitButtonTooltip = input<string>("Save");
  public readonly submitButtonType = input<"button" | "submit">("submit");
  public readonly disableWhenProgressBarIsShown = input<boolean>(false);
  // Set when the dialog edits something that exists: Save is then dimmed while the form is unchanged.
  public readonly editing = input<boolean>(false);
  public readonly submitMode = computed(() => (this.editing() ? FormMode.edit : undefined));
  public readonly cancelClicked = output<void>();
  public readonly submitClicked = output<void>();

  public showProgressBar = this.store.selectSignal(LayoutState.showProgressBar);

  constructor(private store: Store) {}
}
