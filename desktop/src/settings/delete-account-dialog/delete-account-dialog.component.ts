import { Component, Inject, Optional, ChangeDetectionStrategy } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";

/** An identity provider the account can confirm its deletion with. */
export interface DeleteAccountDialogProvider {
  name: string;
  displayName: string;
}

export interface DeleteAccountDialogData {
  /**
   * The account's connected providers. Passed only for an account with no
   * password of its own, which confirms by signing in at one of them again;
   * without it the dialog asks for the password.
   */
  providers?: DeleteAccountDialogProvider[];
}

/** `false` when the dialog was cancelled. */
export type DeleteAccountDialogResult =
  | { password: string }
  | { providerName: string }
  | false;

@Component({
    selector: "app-delete-account-dialog",
    templateUrl: "./delete-account-dialog.component.html",
    styleUrls: ["./delete-account-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class DeleteAccountDialogComponent {
  public form: FormGroup;

  public readonly providers: DeleteAccountDialogProvider[];

  constructor(
    private dialogRef: AppDialogRef<DeleteAccountDialogComponent, DeleteAccountDialogResult>,
    private formBuilder: FormBuilder,
    @Optional() @Inject(APP_DIALOG_DATA) data: DeleteAccountDialogData | null,
  ) {
    this.providers = data?.providers ?? [];
    this.form = this.formBuilder.group({
      password: ["", Validators.required],
    });
  }

  public submitButtonClicked(): void {
    if (this.form.valid) {
      this.dialogRef.close({ password: this.form.get("password")?.value });
    }
  }

  public providerButtonClicked(providerName: string): void {
    this.dialogRef.close({ providerName });
  }

  public cancelButtonClicked(): void {
    this.dialogRef.close(false);
  }
}
