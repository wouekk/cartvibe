import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA, DestroyRef } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { Store } from "@ngxs/store";
import { SYSTEM_RAN_BY_OPTION_ID } from "src/constants";
import { buildDefaultSystemTaskFilter, SystemTaskTableStore } from "src/store/system-task-table.store";
import { InputModule } from "../../input";
import { FilterOperation } from "../../open-api";
import { StoreModule } from "../../store/store.module";
import { applyFormCommand } from "../../utils/index";
import { buildSystemTaskFilterForm } from "../../utils/system-task-filter";
import { SystemTaskFilterComponent } from "./system-task-filter.component";


describe("SystemTaskFilterComponent", () => {
  let component: SystemTaskFilterComponent;
  let fixture: ComponentFixture<SystemTaskFilterComponent>;
  let store: Store;
  let destroyRef: DestroyRef;

  const filledFilter = {
    type: {
      operation: FilterOperation.Contains,
      value: ["QUICK_SCAN"],
    },
    ranBy: {
      operation: FilterOperation.Contains,
      value: [SYSTEM_RAN_BY_OPTION_ID, 4],
    },
    startedAt: {
      operation: FilterOperation.Equals,
      value: "2026-03-11T00:00:00Z",
    },
    endedAt: {
      operation: FilterOperation.LessThan,
      value: "2026-03-12T00:00:00Z",
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [
        InputModule,
        ReactiveFormsModule,
        StoreModule,
        SystemTaskFilterComponent,
    ],
    providers: [
        { provide: AppDialogRef, useValue: { close: () => { } } },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ],
}).compileComponents();

    store = TestBed.inject(Store);
    destroyRef = TestBed.inject(DestroyRef);

    fixture = TestBed.createComponent(SystemTaskFilterComponent);
    component = fixture.componentInstance;
    component.parentForm = buildSystemTaskFilterForm({}, destroyRef);
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("builds an empty form matching the default filter", () => {
    expect(component.parentForm.value).toEqual(buildDefaultSystemTaskFilter());
  });

  it("round-trips a seeded filter", () => {
    const localFixture = TestBed.createComponent(SystemTaskFilterComponent);
    localFixture.componentInstance.parentForm = buildSystemTaskFilterForm(filledFilter, destroyRef);
    localFixture.detectChanges();

    expect(localFixture.componentInstance.parentForm.value).toEqual(filledFilter);
  });

  it("pins System above the real users in the Ran By options", () => {
    expect(component.ranByOptions()[0]).toEqual({
      id: SYSTEM_RAN_BY_OPTION_ID,
      displayName: "System",
    });
  });

  it("renders one row per filter field", () => {
    expect(fixture.nativeElement.querySelectorAll("app-filter-field").length).toBe(4);
  });

  // reset() leaves a FormArray populated, so the two list fields need an
  // explicit clear command on top of it.
  it("resets every field, clearing the list ones", () => {
    component.parentForm = buildSystemTaskFilterForm(filledFilter, destroyRef);
    component.formCommand.subscribe((formCommand) =>
      applyFormCommand(component.parentForm, formCommand)
    );

    component.resetFilter();

    expect(component.parentForm.value).toEqual(buildDefaultSystemTaskFilter());
  });

  it("stores the filter and closes with true on submit", () => {
    const closeSpy = vi.spyOn(TestBed.inject(AppDialogRef<SystemTaskFilterComponent>), "close");

    component.parentForm = buildSystemTaskFilterForm(filledFilter, destroyRef);
    component.submitButtonClicked();

    expect(TestBed.inject(SystemTaskTableStore).filter()).toEqual(filledFilter);
    expect(closeSpy).toHaveBeenCalledWith(true);
  });

  it("closes with false on cancel", () => {
    const closeSpy = vi.spyOn(TestBed.inject(AppDialogRef<SystemTaskFilterComponent>), "close");

    component.cancelButtonClicked();

    expect(closeSpy).toHaveBeenCalledWith(false);
  });
});
