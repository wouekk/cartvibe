import { Component, Input, OnInit, ChangeDetectionStrategy } from "@angular/core";
import { FormControl, FormGroup } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";
import { codePointMaxLengthValidator, trimmedRequiredValidator } from "../../validators";

/** Mirrors the API's RenameReceiptCommand limit. */
export const RECEIPT_NAME_MAX_LENGTH = 255;

/**
 * A small prompt for a receipt's name. It only collects the new name and closes with it (trimmed), or with nothing when
 * cancelled; saving it is the caller's job, since a receipt that is not saved yet has nothing to persist to.
 */
@Component({
  selector: "app-rename-receipt-dialog",
  templateUrl: "./rename-receipt-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class RenameReceiptDialogComponent implements OnInit {
  @Input() public name: string = "";

  public form: FormGroup = new FormGroup({});

  public readonly nameErrorMessages: { [key: string]: string } = {
    maxlength: marker("Name must be {requiredLength} characters or fewer."),
  };

  constructor(private dialogRef: AppDialogRef<RenameReceiptDialogComponent>) {}

  public ngOnInit(): void {
    this.form = new FormGroup({
      name: new FormControl(this.name, [trimmedRequiredValidator(), codePointMaxLengthValidator(RECEIPT_NAME_MAX_LENGTH)]),
    });
  }

  public submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.dialogRef.close(String(this.form.value.name).trim());
  }

  public cancel(): void {
    this.dialogRef.close();
  }
}
