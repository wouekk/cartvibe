import { Component, Inject } from "@angular/core";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";

export interface DescriptionViewerDialogData {
  description: string;
  headerText?: string;
}

@Component({
  selector: "app-description-viewer-dialog",
  templateUrl: "./description-viewer-dialog.component.html",
  styleUrl: "./description-viewer-dialog.component.scss",
  standalone: false,
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
