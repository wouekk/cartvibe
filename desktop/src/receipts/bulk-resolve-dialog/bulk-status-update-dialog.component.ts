import { Component, OnInit, ChangeDetectionStrategy } from "@angular/core";
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { RECEIPT_STATUS_OPTIONS } from "src/constants/receipt-status-options";
import { ReceiptStatus } from "../../open-api";
import { DialogComponent } from "../../shared-ui/dialog/dialog.component";
import { SelectComponent } from "../../select/select/select.component";
import { DialogFooterComponent } from "../../shared-ui/dialog-footer/dialog-footer.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";

@Component({
    selector: "app-bulk-status-update-dialog",
    templateUrl: "./bulk-status-update-dialog.component.html",
    styleUrls: ["./bulk-status-update-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DialogComponent, ReactiveFormsModule, SelectComponent, DialogFooterComponent, TranslatePipe, FormGetPipe]
})
export class BulkStatusUpdateComponent implements OnInit {
  public form: FormGroup = new FormGroup({});

  public receiptStatusOptions = RECEIPT_STATUS_OPTIONS;

  constructor(
    private formBuilder: FormBuilder,
    public matDialogRef: AppDialogRef<BulkStatusUpdateComponent>
  ) {}

  public ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.form = this.formBuilder.group({
      status: [ReceiptStatus.Resolved, Validators.required],
    });
  }

  public cancelButtonClicked(): void {
    this.matDialogRef.close(undefined);
  }

  public submitButtonClicked(): void {
    if (this.form.valid) {
      this.matDialogRef.close(this.form.value);
    }
  }
}
