import { Component } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { MatDialogRef } from "@angular/material/dialog";

@Component({
    selector: "app-delete-account-dialog",
    templateUrl: "./delete-account-dialog.component.html",
    styleUrls: ["./delete-account-dialog.component.scss"],
    standalone: false
})
export class DeleteAccountDialogComponent {
  public form: FormGroup;

  constructor(
    private dialogRef: MatDialogRef<DeleteAccountDialogComponent>,
    private formBuilder: FormBuilder,
  ) {
    this.form = this.formBuilder.group({
      password: ["", Validators.required],
    });
  }

  public submitButtonClicked(): void {
    if (this.form.valid) {
      this.dialogRef.close(this.form.get("password")?.value);
    }
  }

  public cancelButtonClicked(): void {
    this.dialogRef.close(false);
  }
}
