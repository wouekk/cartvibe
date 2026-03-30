import { Component, Input, TemplateRef, input, output } from "@angular/core";
import { Store } from "@ngxs/store";
import { LayoutState } from "src/store/layout.state";

@Component({
    selector: "app-dialog-footer",
    templateUrl: "./dialog-footer.component.html",
    styleUrls: ["./dialog-footer.component.scss"],
    standalone: false
})
export class DialogFooterComponent {
  @Input() public additionalButtonsTemplate?: TemplateRef<any>;
  public readonly submitButtonTooltip = input<string>("Save");
  public readonly submitButtonType = input<"button" | "submit">("submit");
  public readonly disableWhenProgressBarIsShown = input<boolean>(false);
  public readonly cancelClicked = output<void>();
  public readonly submitClicked = output<void>();

  public showProgressBar = this.store.selectSignal(LayoutState.showProgressBar);

  constructor(private store: Store) {}
}
