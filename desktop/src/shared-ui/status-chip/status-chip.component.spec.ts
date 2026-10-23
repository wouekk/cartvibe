import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatusChipComponent } from './status-chip.component';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { PipesModule } from 'src/pipes/pipes.module';
import { ReceiptStatus } from 'src/open-api';

describe('StatusChipComponent', () => {
  let component: StatusChipComponent;
  let fixture: ComponentFixture<StatusChipComponent>;

  const chipClasses = (): string[] =>
    Array.from(
      fixture.nativeElement.querySelector('.status-pill')?.classList ?? []
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StatusChipComponent ],
      imports: [PipesModule],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StatusChipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // The status -> class map is the entire color layer: every status reads as "To check"
  // (yellow) or "Settled" (green).
  const statusCases: { status: ReceiptStatus; expected: string; label: string }[] = [
    { status: ReceiptStatus.Open, expected: 'open', label: 'To check' },
    { status: ReceiptStatus.NeedsAttention, expected: 'open', label: 'To check' },
    { status: ReceiptStatus.Draft, expected: 'open', label: 'To check' },
    { status: ReceiptStatus.Resolved, expected: 'resolved', label: 'Settled' },
    { status: ReceiptStatus.Declined, expected: 'resolved', label: 'Settled' },
  ];

  statusCases.forEach(({ status, expected, label }) => {
    it(`should show ${status} as ${label}`, async () => {
      fixture.componentRef.setInput('status', status);
      await fixture.whenStable();

      const classes = chipClasses();
      expect(classes).toContain(expected);
      expect(classes).not.toContain(expected === 'open' ? 'resolved' : 'open');
      expect(classes).not.toContain('declined');
      expect(fixture.nativeElement.textContent.trim()).toBe(label);
    });
  });

  // The activity list drives the chip with customStatusColor for system-task status.
  // 'red' keeps meaning red.
  it('should map the red custom status color onto the declined class', async () => {
    fixture.componentRef.setInput('customStatusColor', 'red');
    await fixture.whenStable();

    const classes = chipClasses();
    expect(classes).toContain('declined');
    expect(classes).not.toContain('needs-attention');
  });

  it('should map the green custom status color onto the resolved class', async () => {
    fixture.componentRef.setInput('customStatusColor', 'green');
    await fixture.whenStable();

    expect(chipClasses()).toContain('resolved');
  });
});
