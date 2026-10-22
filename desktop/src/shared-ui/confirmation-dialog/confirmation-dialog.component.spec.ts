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
});
