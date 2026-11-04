import { ChangeDetectionStrategy, Component, ElementRef, inject } from "@angular/core";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { DatepickerModule } from "../../datepicker/datepicker.module";
import { formatDateInput, parseDateInput } from "../../datepicker/date-input.directive";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { shakeInvalid } from "../../utils/shake";

export interface WarrantyDateDialogData {
  /** The shop or receipt name, shown so the person knows which warranty they change. */
  shop: string;
  /** The current end date, "yyyy-MM-dd". */
  warrantyUntil: string;
}

/** Picks a warranty's new last day. Closes with "yyyy-MM-dd", or undefined when cancelled. */
@Component({
  selector: "app-warranty-date-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatepickerModule, SharedUiModule, TranslatePipe],
  template: `
    <app-dialog [headerText]="'Edit warranty' | t">
      <form (ngSubmit)="submit()" data-testid="warranty-date-form">
        <p class="m-0 mb-3 text-sm text-muted-foreground">{{ 'Warranty for: {name}' | t: { name: data.shop } }}</p>
        <app-datepicker
          data-testid="warranty-date-input"
          [label]="'Warranty until' | t"
          [inputFormControl]="control"
        ></app-datepicker>
        <app-dialog-footer submitButtonTooltip="Save" (cancelClicked)="cancel()"></app-dialog-footer>
      </form>
    </app-dialog>
  `,
})
export class WarrantyDateDialogComponent {
  public readonly data = inject<WarrantyDateDialogData>(APP_DIALOG_DATA);
  private readonly dialogRef = inject<AppDialogRef<WarrantyDateDialogComponent, string>>(AppDialogRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  public readonly control = new FormControl<Date | null>(parseDateInput(this.data.warrantyUntil), Validators.required);

  public submit(): void {
    const day = formatDateInput(this.control.value);
    if (!day) {
      this.control.markAsTouched();
      shakeInvalid(this.host.nativeElement.querySelector("[data-testid=\"warranty-date-input\"]"));
      return;
    }
    this.dialogRef.close(day);
  }

  public cancel(): void {
    this.dialogRef.close();
  }
}
