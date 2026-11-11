import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NgxsModule } from "@ngxs/store";
import { provideRouter } from "@angular/router";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { WarrantyDateDialogComponent } from "./warranty-date-dialog.component";

describe("WarrantyDateDialogComponent", () => {
  let close: ReturnType<typeof vi.fn>;

  const create = async () => {
    close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [WarrantyDateDialogComponent, NgxsModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: APP_DIALOG_DATA, useValue: { shop: "MediaMarkt", warrantyUntil: "2028-09-01" } },
        { provide: AppDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(WarrantyDateDialogComponent);
    await fixture.whenStable();
    return fixture;
  };

  it("starts at the current end date and closes with the picked day", async () => {
    const fixture = await create();
    const component = fixture.componentInstance;

    expect(component.control.value?.getFullYear()).toBe(2028);
    component.control.setValue(new Date(2029, 0, 31));
    component.submit();

    expect(close).toHaveBeenCalledWith("2029-01-31");
  });

  it("does not close without a day", async () => {
    const fixture = await create();
    fixture.componentInstance.control.setValue(null);

    fixture.componentInstance.submit();

    expect(close).not.toHaveBeenCalled();
  });

  it("closes with nothing on Cancel", async () => {
    const fixture = await create();

    fixture.componentInstance.cancel();

    expect(close).toHaveBeenCalledWith();
  });
});
