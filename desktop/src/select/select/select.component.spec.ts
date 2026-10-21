import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BadgeComponent } from '../../shared-ui/badge/badge.component';
import { OptionDisplayPipe } from '../pipes/option-display.pipe';
import { ReadonlyValuePipe } from '../pipes/readonly-value.pipe';
import { SelectComponent } from './select.component';

describe('SelectComponent', () => {
  let component: SelectComponent;
  let fixture: ComponentFixture<SelectComponent>;

  const options = [
    { value: 'category', displayValue: 'Category', badge: '' },
    { value: 'custom_7', displayValue: 'HST', badge: 'Custom' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SelectComponent, OptionDisplayPipe, ReadonlyValuePipe],
      imports: [...HlmSelectImports, ...HlmInputImports, ReactiveFormsModule, NoopAnimationsModule, BadgeComponent],
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

  // --- optionBadgeKey -----------------------------------------------------

  function configure(optionBadgeKey: string, value: string | null): void {
    component.inputFormControl = new FormControl(value);
    component.optionValueKey = 'value';
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('optionDisplayKey', 'displayValue');
    fixture.componentRef.setInput('optionBadgeKey', optionBadgeKey);
  }

  it('reads an option badge only when optionBadgeKey names one', () => {
    fixture.componentRef.setInput('optionBadgeKey', 'badge');
    expect(component.badgeFor(options[1])).toBe('Custom');
    expect(component.badgeFor(options[0])).toBe('');
    expect(component.badgeFor(undefined)).toBe('');

    // Unset (every existing call site) means no badge at all.
    fixture.componentRef.setInput('optionBadgeKey', '');
    expect(component.badgeFor(options[1])).toBe('');
  });

  it('resolves the selected option by its value key, or -1 when absent', () => {
    configure('badge', 'custom_7');
    expect(component.selectedIndex()).toBe(1);

    component.inputFormControl.setValue('nope');
    expect(component.selectedIndex()).toBe(-1);
  });

  // Without an optionValueKey the control holds the option OBJECT itself, so the
  // match is by reference — the other half of selectedIndex()'s branch.
  it('resolves the selection by identity when there is no value key', () => {
    component.inputFormControl = new FormControl(options[1]);
    component.optionValueKey = '';
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('optionDisplayKey', 'displayValue');
    fixture.componentRef.setInput('optionBadgeKey', 'badge');

    expect(component.selectedIndex()).toBe(1);

    // An equal-looking copy is a different reference, so it does not match —
    // which is the same rule mat-select itself applies without a compareWith.
    component.inputFormControl.setValue({ ...options[1] });
    expect(component.selectedIndex()).toBe(-1);

    component.inputFormControl.setValue('nope');
    expect(component.selectedIndex()).toBe(-1);
  });

  it("shows the selected option as the closed select text, without its badge", () => {
    configure('badge', 'custom_7');

    expect(component.itemToString('custom_7')).toBe('HST');
    expect(component.itemToString('nope')).toBe('');
  });
});
