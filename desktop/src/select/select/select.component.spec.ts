import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { OptionDisplayPipe } from '../pipes/option-display.pipe';
import { ReadonlyValuePipe } from '../pipes/readonly-value.pipe';
import { SelectComponent } from './select.component';
import { TranslationService } from '../../i18n/translation.service';

describe('SelectComponent', () => {
  let component: SelectComponent;
  let fixture: ComponentFixture<SelectComponent>;

  const options = [
    { value: 'category', displayValue: 'Category' },
    { value: 'hst', displayValue: 'HST' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SelectComponent, OptionDisplayPipe, ReadonlyValuePipe],
      imports: [...HlmSelectImports, ...HlmInputImports, ReactiveFormsModule, NoopAnimationsModule],
      providers: [OptionDisplayPipe, provideZonelessChangeDetection()],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(SelectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function configure(value: string | null): void {
    component.inputFormControl = new FormControl(value);
    component.optionValueKey = 'value';
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('optionDisplayKey', 'displayValue');
  }

  it("shows the selected option as the closed select text", () => {
    configure('hst');

    expect(component.itemToString('hst')).toBe('HST');
    expect(component.itemToString('nope')).toBe('');
  });

  it("translates the closed select text like the open list", () => {
    configure('hst');
    jest.spyOn(TestBed.inject(TranslationService), 't').mockImplementation((text: string) => (text === 'HST' ? 'PST' : text));

    expect(component.itemToString('hst')).toBe('PST');
  });
});
