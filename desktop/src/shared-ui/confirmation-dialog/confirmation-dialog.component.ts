import { Component, Input, TemplateRef, ChangeDetectionStrategy } from '@angular/core';
import { AppDialogRef } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";

/** The confirm labels that delete or remove something. */
export const DESTRUCTIVE_CONFIRM_TEXTS = [marker("Delete"), marker("Remove")];

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

  /** A Delete or Remove confirmation gets a red button; any other action keeps the primary one. */
  public destructive(): boolean {
    return DESTRUCTIVE_CONFIRM_TEXTS.includes(this.confirmText);
  }

  public submitButtonClicked(): void {
    this.dialogRef.close(true);
  }

  public cancelButtonClicked(): void {
    this.dialogRef.close(false);
  }
}
