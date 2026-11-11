import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { ReceiptStatus } from "../../open-api";
import { BulkStatusUpdateComponent } from "./bulk-status-update-dialog.component";

describe("BulkStatusUpdateComponent", () => {
  let component: BulkStatusUpdateComponent;
  let fixture: ComponentFixture<BulkStatusUpdateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [ReactiveFormsModule, BulkStatusUpdateComponent],
    providers: [
        {
            provide: AppDialogRef,
            useValue: {
                close: (arg: any) => { },
            },
        },
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
}).compileComponents();

    fixture = TestBed.createComponent(BulkStatusUpdateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should init form correctly", () => {
    component.ngOnInit();

    // The status and nothing else: a receipt has one note, and a bulk change does not write to it.
    expect(component.form.value).toEqual({
      status: ReceiptStatus.Resolved,
    });
  });

  it("should close dialog with undefined", () => {
    const spy = vi.spyOn(component.dialogRef, "close");
    component.cancelButtonClicked();

    expect(spy).toHaveBeenCalledWith(undefined);
  });

  it("should close dialog with form value", () => {
    const spy = vi.spyOn(component.dialogRef, "close");
    component.form.patchValue({
      status: ReceiptStatus.Open,
    });
    component.submitButtonClicked();

    expect(spy).toHaveBeenCalledWith({
      status: ReceiptStatus.Open,
    });
  });
});
