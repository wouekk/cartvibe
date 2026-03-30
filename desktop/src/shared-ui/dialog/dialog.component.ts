import { Component, Input, TemplateRef, input } from "@angular/core";

@Component({
    selector: "app-dialog",
    templateUrl: "./dialog.component.html",
    styleUrls: ["./dialog.component.scss"],
    standalone: false
})
export class DialogComponent {
  public readonly headerText = input<string>("");

  @Input() public actionsTemplate?: TemplateRef<any>;
}
