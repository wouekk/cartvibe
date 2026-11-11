import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { FormMode } from "src/enums/form-mode.enum";
import { StoreModule } from "../../store/store.module";
import { SharedUiModule } from "../shared-ui.module";
import { FormComponent } from "./form.component";

describe("FormComponent", () => {
  let component: FormComponent;
  let fixture: ComponentFixture<FormComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [
        ReactiveFormsModule,
        SharedUiModule,
        StoreModule,
        FormComponent,
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    providers: [
        {
            provide: ActivatedRoute,
            useValue: {},
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ],
});
    fixture = TestBed.createComponent(FormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('formConfig', {
      headerText: "test",
      mode: FormMode.add,
    });
    fixture.componentRef.setInput('form', new FormGroup({}));
    fixture.componentRef.setInput('formTemplate', {} as any);
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("says it is editing only for a saved record, so only then does its Save show unsaved changes", () => {
    for (const [mode, editing] of [
      [FormMode.add, false],
      [FormMode.view, false],
      [FormMode.edit, true],
    ] as const) {
      fixture.componentRef.setInput("formConfig", { headerText: "test", mode });
      expect(component.editing()).toBe(editing);
    }
  });
});
