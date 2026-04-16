import { Component, Inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";

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
    public dialogRef: MatDialogRef<DescriptionViewerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DescriptionViewerDialogData,
  ) {}

  public close(): void {
    this.dialogRef.close();
  }
}
