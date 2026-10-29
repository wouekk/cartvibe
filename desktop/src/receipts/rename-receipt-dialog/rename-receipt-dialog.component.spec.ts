import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { PipesModule } from "../../pipes";
import { RECEIPT_NAME_MAX_LENGTH, RenameReceiptDialogComponent } from "./rename-receipt-dialog.component";

describe("RenameReceiptDialogComponent", () => {
  let component: RenameReceiptDialogComponent;
  let fixture: ComponentFixture<RenameReceiptDialogComponent>;
  const close = vi.fn();

  beforeEach(() => {
    close.mockReset();
    TestBed.configureTestingModule({
      declarations: [RenameReceiptDialogComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      imports: [PipesModule, ReactiveFormsModule],
      providers: [{ provide: AppDialogRef, useValue: { close } }],
    });
    fixture = TestBed.createComponent(RenameReceiptDialogComponent);
    component = fixture.componentInstance;
    component.name = "Lunch";
    fixture.detectChanges();
  });

  it("starts with the current name", () => {
    expect(component.form.get("name")?.value).toEqual("Lunch");
  });

  it("closes with the trimmed new name", () => {
    component.form.get("name")?.setValue("  Weekly shop ");

    component.submit();

    expect(close).toHaveBeenCalledWith("Weekly shop");
  });

  it("refuses a blank name", () => {
    component.form.get("name")?.setValue("   ");

    component.submit();

    expect(close).not.toHaveBeenCalled();
    expect(component.form.get("name")?.hasError("required")).toBe(true);
  });

  it("refuses a name over the limit, counted in characters", () => {
    component.form.get("name")?.setValue("é".repeat(RECEIPT_NAME_MAX_LENGTH));
    component.submit();
    expect(close).toHaveBeenCalledTimes(1);

    close.mockReset();
    component.form.get("name")?.setValue("é".repeat(RECEIPT_NAME_MAX_LENGTH + 1));
    component.submit();
    expect(close).not.toHaveBeenCalled();
  });

  it("closes with nothing when cancelled", () => {
    component.cancel();

    expect(close).toHaveBeenCalledWith();
  });
});
