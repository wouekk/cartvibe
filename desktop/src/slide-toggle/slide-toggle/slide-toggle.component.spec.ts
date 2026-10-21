import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SlideToggleComponent } from './slide-toggle.component';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

describe('SlideToggleComponent', () => {
  let component: SlideToggleComponent;
  let fixture: ComponentFixture<SlideToggleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SlideToggleComponent],
            schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(SlideToggleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
