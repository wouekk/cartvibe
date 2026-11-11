import { Component, Input, OnInit, ChangeDetectionStrategy } from "@angular/core";
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { take, tap } from "rxjs";
import { User, UserService } from "../../open-api";
import { SnackbarService } from "../../services";
import { InputComponent } from "../../input/input/input.component";
import { CancelButtonComponent } from "../../shared-ui/cancel-button/cancel-button.component";
import { SubmitButtonComponent } from "../../shared-ui/submit-button/submit-button.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";

@Component({
    selector: "app-reset-password",
    templateUrl: "./reset-password.component.html",
    styleUrls: ["./reset-password.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ReactiveFormsModule, InputComponent, CancelButtonComponent, SubmitButtonComponent, TranslatePipe, FormGetPipe]
})
export class ResetPasswordComponent implements OnInit {
  @Input() public user!: User;

  public form: FormGroup = new FormGroup({});

  constructor(
    private formBuilder: FormBuilder,
    private matDialogRef: AppDialogRef<ResetPasswordComponent>,
    private snackbarService: SnackbarService,
    private userService: UserService
  ) {}

  public ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.form = this.formBuilder.group({
      password: ["", Validators.required],
    });
  }

  public submit(): void {
    if (this.form.valid) {
      this.userService
        .resetPasswordById(this.user.id, this.form.value,)
        .pipe(
          take(1),
          tap(() => {
            this.snackbarService.success("Password successfully set");
            this.matDialogRef.close();
          })
        )
        .subscribe();
    }
  }

  public closeModal(): void {
    this.matDialogRef.close();
  }
}
