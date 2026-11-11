import { Component, Inject, ChangeDetectionStrategy } from "@angular/core";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { DialogComponent } from "../dialog/dialog.component";
import { CopyButtonComponent } from "../copy-button/copy-button.component";
import { PrettyJsonComponent } from "../pretty-json/pretty-json.component";
import { ButtonComponent } from "../../button/button/button.component";
import { TranslatePipe } from "../../i18n/translate.pipe";

export interface DescriptionViewerDialogData {
  description: string;
  headerText?: string;
}

@Component({
    selector: "app-description-viewer-dialog",
    templateUrl: "./description-viewer-dialog.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DialogComponent,
        CopyButtonComponent,
        PrettyJsonComponent,
        ButtonComponent,
        TranslatePipe,
    ],
})
export class DescriptionViewerDialogComponent {
  constructor(
    public dialogRef: AppDialogRef<DescriptionViewerDialogComponent>,
    @Inject(APP_DIALOG_DATA) public data: DescriptionViewerDialogData,
  ) {}

  public close(): void {
    this.dialogRef.close();
  }
}
