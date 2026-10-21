import { TranslatePipe } from "../../i18n/translate.pipe";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BaseFormComponent } from './base-form.component';

describe('BaseFormComponent', () => {
  let component: BaseFormComponent;
  let fixture: ComponentFixture<BaseFormComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslatePipe],
      declarations: [BaseFormComponent]
    });
    fixture = TestBed.createComponent(BaseFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
