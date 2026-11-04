import { TranslateDataPipe, TranslatePipe } from "../../i18n/translate.pipe";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormHeaderComponent } from './form-header.component';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

describe('FormHeaderComponent', () => {
  let component: FormHeaderComponent;
  let fixture: ComponentFixture<FormHeaderComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslatePipe, TranslateDataPipe],
      declarations: [FormHeaderComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });
    fixture = TestBed.createComponent(FormHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it("shows a receipt's own name as written", async () => {
    fixture.componentRef.setInput("headerText", "Edit {name}");
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("h1").textContent.trim()).toBe("Edit {name}");
  });
});
