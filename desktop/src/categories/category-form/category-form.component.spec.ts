import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { of } from "rxjs";
import { DuplicateValidator } from "src/validators/duplicate-validator";
import { ApiModule, CategoryService, CategoryView } from "../../open-api";
import { PipesModule } from "../../pipes";
import { CategoryForm } from "./category-form.component";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";

describe("CategoryForm", () => {
  let component: CategoryForm;
  let fixture: ComponentFixture<CategoryForm>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    declarations: [CategoryForm],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [ApiModule,
        PipesModule,
        ReactiveFormsModule,
        NoopAnimationsModule],
    providers: [
        DuplicateValidator,
        {
            provide: AppDialogRef,
            useValue: {
                close: () => { },
            },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
});
    fixture = TestBed.createComponent(CategoryForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("provides its own duplicate validator, so a dialog opened from the root injector renders", () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      declarations: [CategoryForm],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      imports: [ApiModule, PipesModule, ReactiveFormsModule, NoopAnimationsModule],
      providers: [
        { provide: AppDialogRef, useValue: { close: () => {} } },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });

    const standalone = TestBed.createComponent(CategoryForm);
    standalone.detectChanges();

    expect(standalone.componentInstance.form.contains("name")).toBe(true);
  });

  it("should init form with data", () => {
    const category: CategoryView = {
      id: 1,
      name: "test",
      description: "test",
      numberOfReceipts: 1,
    };
    component.category = category;

    component.ngOnInit();

    expect(component.form.value).toEqual({
      name: "test",
      description: "test",
      skipped: false,
    });
  });

  it("should submit form with correct data, when editing", () => {
    const categoryServiceSpy = jest.spyOn(
      TestBed.inject(CategoryService),
      "updateCategory"
    );
    categoryServiceSpy.mockReturnValue(of({} as any));
    const nameValidateSpy = jest.spyOn(
      TestBed.inject(CategoryService),
      "getCategoryCountByName"
    ).mockReturnValue(of(0) as any);
    const category: CategoryView = {
      id: 1,
      name: "test",
      description: "test",
      numberOfReceipts: 1,
    };
    component.category = category;

    component.ngOnInit();
    component.submit();

    expect(categoryServiceSpy).toHaveBeenCalledWith(
      1,
      {
        id: 1,
        name: "test",
        description: "test",
        skipped: false,
      },
    );
  });

  it("should submit form with correct data, when creating", () => {
    const nameValidateSpy = jest.spyOn(
      TestBed.inject(CategoryService),
      "getCategoryCountByName"
    ).mockReturnValue(of(0) as any);
    const categoryServiceSpy = jest.spyOn(
      TestBed.inject(CategoryService),
      "createCategory"
    );
    categoryServiceSpy.mockReturnValue(of({} as any));

    component.ngOnInit();
    component.form.patchValue({
      name: "test",
      description: "test",
    });
    component.submit();

    expect(categoryServiceSpy).toHaveBeenCalledWith({
      name: "test",
      description: "test",
      skipped: false,
    });
  });
});
