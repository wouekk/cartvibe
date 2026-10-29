import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { NgxsModule, Store } from "@ngxs/store";
import { PipesModule } from "../../pipes";
import { GroupTableState } from "../../store/group-table.state";
import { SetFilter } from "../../store/group-table.state.actions";

import { GroupTableFilterComponent } from "./group-table-filter.component";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";

describe("GroupTableFilterComponent", () => {
  let component: GroupTableFilterComponent;
  let fixture: ComponentFixture<GroupTableFilterComponent>;
  let store: Store;
  let dialogRef: AppDialogRef<GroupTableFilterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [GroupTableFilterComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [ReactiveFormsModule, NgxsModule.forRoot([GroupTableState]), PipesModule, ReactiveFormsModule],
    providers: [
        { provide: AppDialogRef, useValue: { close: vi.fn() } },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
    ]
})
      .compileComponents();

    fixture = TestBed.createComponent(GroupTableFilterComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(Store);
    dialogRef = TestBed.inject(AppDialogRef);
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should initialize form with current filter from store", () => {
    const filter = { associatedGroup: "test" };
    vi.spyOn(store, "selectSnapshot").mockReturnValue(filter);
    component.ngOnInit();
    expect(component.form.value).toEqual(filter);
  });

  it("should dispatch SetFilter action with form value and close dialog on submit", () => {
    const store = TestBed.inject(Store);
    const storeSpy = vi.spyOn(store, "dispatch");

    component.ngOnInit();
    const formValue = { associatedGroup: "test" };
    component.form.setValue(formValue);
    component.submit();
    expect(storeSpy).toHaveBeenCalledWith(new SetFilter(formValue as any));
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it("should close dialog on cancel", () => {
    component.cancel();
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
