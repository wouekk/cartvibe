import { Component, Input, OnInit, inject, ChangeDetectionStrategy } from "@angular/core";
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { take, tap } from "rxjs";
import { User, UserService } from "../../open-api";
import { SnackbarService } from "../../services";
import { UserStore } from "../../store";
import { TranslationService } from "../../i18n/translation.service";
import { DialogComponent } from "../../shared-ui/dialog/dialog.component";
import { InputComponent } from "../../input/input/input.component";
import { DialogFooterComponent } from "../../shared-ui/dialog-footer/dialog-footer.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";

@Component({
    selector: "app-dummy-user-conversion-dialog",
    templateUrl: "./dummy-user-conversion-dialog.component.html",
    styleUrls: ["./dummy-user-conversion-dialog.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DialogComponent, ReactiveFormsModule, InputComponent, DialogFooterComponent, TranslatePipe, FormGetPipe]
})
export class DummyUserConversionDialogComponent implements OnInit {
  private readonly userStore = inject(UserStore);

  private readonly translation = inject(TranslationService);

  @Input() public user!: User;

  public form: FormGroup = new FormGroup({});

  constructor(
    private formBuilder: FormBuilder,
    private snackbarService: SnackbarService,
    private userService: UserService,
    public dialogRef: AppDialogRef<DummyUserConversionDialogComponent>
  ) {}

  public ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.form = this.formBuilder.group({
      password: ["", Validators.required],
    });
  }

  public submitButtonClicked(): void {
    if (this.form.valid) {
      let userId: string = this.user?.id?.toString();
      this.userService
        .convertDummyUserById( Number.parseInt(userId), this.form.value)
        .pipe(
          take(1),
          tap(() => {
            this.snackbarService.success(
              this.translation.t("{name} is now a normal user", { name: this.user.displayName })
            );
          }),
          tap(() =>
            this.userStore.updateUser(userId, { ...this.user, isDummyUser: false })
          ),
          tap(() => this.dialogRef.close(true))
        )
        .subscribe();
    }
  }

  public cancelButtonClicked(): void {
    this.dialogRef.close(false);
  }
}
