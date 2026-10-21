import { Component, Input, TemplateRef } from '@angular/core';
import { AppDialogRef } from "../../dialog/app-dialog";

@Component({
    selector: 'app-confirmation-dialog',
    templateUrl: './confirmation-dialog.component.html',
    styleUrls: ['./confirmation-dialog.component.scss'],
    standalone: false
})
export class ConfirmationDialogComponent {
  constructor(private dialogRef: AppDialogRef<ConfirmationDialogComponent>) {}

  @Input() public headerText: string = '';

  @Input() public dialogContent: string = '';

  public submitButtonClicked(): void {
    this.dialogRef.close(true);
  }

  public cancelButtonClicked(): void {
    this.dialogRef.close(false);
  }
}
