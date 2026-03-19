import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { MatDialogRef } from "@angular/material/dialog";
import { DeleteAccountDialogComponent } from "./delete-account-dialog.component";
import { PipesModule } from "src/pipes/pipes.module";

describe("DeleteAccountDialogComponent", () => {
  let component: DeleteAccountDialogComponent;
  let fixture: ComponentFixture<DeleteAccountDialogComponent>;
  let dialogRefSpy: jest.Mocked<MatDialogRef<DeleteAccountDialogComponent>>;

  beforeEach(async () => {
    dialogRefSpy = {
      close: jest.fn(),
    } as any;

    await TestBed.configureTestingModule({
      declarations: [DeleteAccountDialogComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      imports: [ReactiveFormsModule, PipesModule],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeleteAccountDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should close with password when submit is clicked and form is valid", () => {
    component.form.patchValue({ password: "mypassword" });
    component.submitButtonClicked();

    expect(dialogRefSpy.close).toHaveBeenCalledWith("mypassword");
  });

  it("should not close when submit is clicked and form is invalid", () => {
    component.submitButtonClicked();

    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it("should close with false when cancel is clicked", () => {
    component.cancelButtonClicked();

    expect(dialogRefSpy.close).toHaveBeenCalledWith(false);
  });
});
