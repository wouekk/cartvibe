import { Component, Input, OnInit } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { take, tap } from "rxjs";
import { DuplicateValidator } from "src/validators/duplicate-validator";
import { TagService, TagView, UpsertTagCommand } from "../../open-api";
import { SnackbarService } from "../../services";

@Component({
    selector: "app-tag-form",
    templateUrl: "./tag-form.component.html",
    styleUrls: ["./tag-form.component.scss"],
    providers: [DuplicateValidator],
    standalone: false
})
export class TagFormComponent implements OnInit {
  @Input() public headerText: string = "";

  @Input() public tag?: TagView;

  public form: FormGroup = new FormGroup({});

  constructor(
    private formBuilder: FormBuilder,
    private matDialogRef: AppDialogRef<TagFormComponent>,
    private categoryService: TagService,
    private snackService: SnackbarService,
    private duplicateValidator: DuplicateValidator
  ) {}

  public ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    const name = this.tag?.name ?? "";

    const nameValidator = this.duplicateValidator.isUnique("tag", 0, name);
    this.form = this.formBuilder.group({
      name: [name, Validators.required, nameValidator],
      description: [this.tag?.description ?? ""],
      // A new tag gets its own Dashboard tile unless switched off; an existing one keeps its setting.
      showOnDashboard: [this.tag ? (this.tag.showOnDashboard ?? false) : true],
    });
  }

  public submit(): void {
    if (this.form.valid && this.tag) {
      const command: UpsertTagCommand = {
        name: this.form.value.name,
        description: this.form.value.description,
        showOnDashboard: this.form.value.showOnDashboard,
      };
      this.categoryService
        .updateTag (this.tag.id as number, command)
        .pipe(
          take(1),
          tap(() => {
            this.snackService.success("Tag updated successfully");
            this.matDialogRef.close(true);
          })
        )
        .subscribe();
    } else if (this.form.valid && !this.tag) {
      this.categoryService
        .createTag(this.form.value)
        .pipe(
          take(1),
          tap(() => {
            this.snackService.success("Tag created successfully");
            this.matDialogRef.close(true);
          })
        )
        .subscribe();
    }
  }

  public closeDialog(): void {
    this.matDialogRef.close(false);
  }
}
