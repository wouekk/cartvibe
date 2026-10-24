import { TranslatePipe } from "../../i18n/translate.pipe";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmationDialogComponent } from './confirmation-dialog.component';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AppDialogRef } from "../../dialog/app-dialog";

describe('ConfirmationDialogComponent', () => {
  let component: ConfirmationDialogComponent;
  let fixture: ComponentFixture<ConfirmationDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ConfirmationDialogComponent],
      imports: [TranslatePipe, ],
      providers: [
        {
          provide: AppDialogRef,
          useValue: {},
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmationDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('labels the confirm button "Confirm" unless the caller names the action', () => {
    const footer = () => fixture.nativeElement.querySelector('app-dialog-footer');
    expect(footer().submitButtonTooltip).toBe('Confirm');

    component.confirmText = 'Add AI API key';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    expect(footer().submitButtonTooltip).toBe('Add AI API key');
  });

  it('makes the button red for Delete and Remove only', () => {
    const footer = () => fixture.nativeElement.querySelector('app-dialog-footer');
    expect(footer().submitDestructive).toBe(false);

    for (const [text, red] of [['Delete', true], ['Remove', true], ['Add AI API key', false]] as const) {
      component.confirmText = text;
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      expect(footer().submitDestructive).toBe(red);
    }
  });

  it('starts the focus on the question, so no button tooltip pops open with the dialog', () => {
    const content: HTMLElement = fixture.nativeElement.querySelector('[data-testid=confirmation-dialog-content]');
    expect(content.hasAttribute('cdkFocusInitial')).toBe(true);
    expect(content.getAttribute('tabindex')).toBe('-1');
  });
});
