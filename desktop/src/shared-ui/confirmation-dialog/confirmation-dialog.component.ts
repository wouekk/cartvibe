import { Component, Input, TemplateRef, ChangeDetectionStrategy } from '@angular/core';
import { AppDialogRef } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";

@Component({
    selector: 'app-confirmation-dialog',
    templateUrl: './confirmation-dialog.component.html',
    styleUrls: ['./confirmation-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ConfirmationDialogComponent {
  constructor(private dialogRef: AppDialogRef<ConfirmationDialogComponent>) {}

  @Input() public headerText: string = '';

  @Input() public dialogContent: string = '';

  /** The confirm button's label; "Confirm" unless the action has a name of its own ("Add AI API key"). */
  @Input() public confirmText: string = marker('Confirm');

  public submitButtonClicked(): void {
    this.dialogRef.close(true);
  }

  public cancelButtonClicked(): void {
    this.dialogRef.close(false);
  }
}
