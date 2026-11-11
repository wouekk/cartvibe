import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA, DestroyRef } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { defaultReceiptFilter, ReceiptTableStore } from "src/store/receipt-table.store";
import { InputModule } from "../../input";
import { Category, FilterOperation, ReceiptStatus, Tag } from "../../open-api";
import { applyFormCommand } from "../../utils/index";
import { buildReceiptFilterForm } from "../../utils/receipt-filter";
import { OperationsPipe } from "./operations.pipe";
import { ReceiptFilterComponent } from "./receipt-filter.component";


describe("ReceiptFilterComponent", () => {
  let component: ReceiptFilterComponent;
  let fixture: ComponentFixture<ReceiptFilterComponent>;

  const filledFilter = {
    date: {
      operation: FilterOperation.Equals,
      value: "2023-01-06",
    },
    name: {
      operation: FilterOperation.Equals,
      value: "hello world",
    },
    amount: {
      operation: FilterOperation.GreaterThan,
      value: 12.05,
    },
    paidBy: {
      operation: FilterOperation.Contains,
      value: [1],
    },
    categories: {
      operation: FilterOperation.Contains,
      value: [2],
    },
    tags: {
      operation: FilterOperation.Contains,
      value: [3, 4],
    },
    status: {
      operation: FilterOperation.Contains,
      value: [ReceiptStatus.Open],
    },
    group: {
      operation: FilterOperation.Contains,
      value: [1],
    },
    resolvedDate: {
      operation: FilterOperation.GreaterThan,
      value: "2023-01-06",
    },
    createdAt: {
      operation: FilterOperation.GreaterThan,
      value: "2023-01-06",
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [InputModule,
                ReactiveFormsModule, ReceiptFilterComponent, OperationsPipe],
    providers: [
        {
            provide: AppDialogRef,
            useValue: {
                close: (value: any) => { },
            },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
});

    fixture = TestBed.createComponent(ReceiptFilterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("uses the category/tag options provided as inputs", () => {
    const categories = [{ id: 2, name: "Groceries" }] as Category[];
    const tags = [{ id: 3, name: "Reimbursable" }] as Tag[];

    component.categories = categories;
    component.tags = tags;
    component.ngOnInit();

    expect(component.categories).toBe(categories);
    expect(component.tags).toBe(tags);
  });

  it("should init form with no default initial data", () => {
    const destroyRef = TestBed.inject(DestroyRef);

    component.parentForm = buildReceiptFilterForm({}, destroyRef);
    component.ngOnInit();

    expect(component.parentForm.value).toEqual(defaultReceiptFilter);
  });

  it("should init form with initial data", () => {
    const destroyRef = TestBed.inject(DestroyRef);

    component.parentForm = buildReceiptFilterForm(filledFilter, destroyRef);
    component.ngOnInit();

    expect(component.parentForm.value).toEqual(filledFilter);
  });

  it("should reset form", () => {
    component.formCommand.subscribe((formCommand) => {
      applyFormCommand(component.parentForm, formCommand);
    });

    const destroyRef = TestBed.inject(DestroyRef);

    component.parentForm = buildReceiptFilterForm(filledFilter, destroyRef);
    component.ngOnInit();

    expect(component.parentForm.value).toEqual(filledFilter);

    component.resetFilter();
    expect(component.parentForm.value).toEqual(defaultReceiptFilter);
  });

  it("should set form in state and close dialog", () => {
    const dialogRefSpy = vi.spyOn(
      TestBed.inject(AppDialogRef<ReceiptFilterComponent>),
      "close"
    );
    const destroyRef = TestBed.inject(DestroyRef);
    component.parentForm = buildReceiptFilterForm(filledFilter, destroyRef);

    component.submitButtonClicked();

    expect(TestBed.inject(ReceiptTableStore).state().filter).toEqual({ ...filledFilter, search: undefined });
    expect(dialogRefSpy).toHaveBeenCalledWith(true);
  });

  it("renders the group field only when showGroupFilter is true", () => {
    const destroyRef = TestBed.inject(DestroyRef);

    const countListRows = (showGroupFilter: boolean): number => {
      const localFixture = TestBed.createComponent(ReceiptFilterComponent);
      localFixture.componentInstance.parentForm = buildReceiptFilterForm({}, destroyRef);
      localFixture.componentInstance.showGroupFilter = showGroupFilter;
      localFixture.detectChanges();
      // The rows are the shared app-filter-field; CUSTOM_ELEMENTS_SCHEMA keeps
      // it unrendered here, so the inner controls it projects are not in the DOM.
      return localFixture.nativeElement.querySelectorAll("app-filter-field[type='list']").length;
    };

    // The group field is the only additional list row gated on the flag.
    expect(countListRows(true)).toBe(countListRows(false) + 1);
  });

  it("defaults showGroupFilter to false", () => {
    expect(component.showGroupFilter).toBe(false);
  });

  it("should close dialog on cancel", () => {
    const dialogRefSpy = vi.spyOn(
      TestBed.inject(AppDialogRef<ReceiptFilterComponent>),
      "close"
    );
    component.cancelButtonClicked();

    expect(dialogRefSpy).toHaveBeenCalledWith(false);
  });
});
