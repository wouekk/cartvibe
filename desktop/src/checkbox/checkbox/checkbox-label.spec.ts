import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';

@Component({
  imports: [HlmCheckboxImports],
  template: `
    <label data-testid="first"><hlm-checkbox [checked]="true" /><span>Receipt Date</span></label>
    <label data-testid="second"><hlm-checkbox [checked]="false" /><span>Shop</span></label>
  `,
})
class TwoCheckboxesHost {}

describe('hlm-checkbox labelling', () => {
  it('names each checkbox after its own label, not after the first one on the page', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(TwoCheckboxesHost);
    fixture.detectChanges();
    await fixture.whenStable();

    const root: HTMLElement = fixture.nativeElement;
    const buttons = Array.from(root.querySelectorAll<HTMLElement>('[role="checkbox"]'));
    const names = buttons.map((button) => {
      const target = root.ownerDocument.getElementById(button.getAttribute('aria-labelledby') ?? '');
      return target?.textContent?.trim();
    });

    expect(names).toEqual(['Receipt Date', 'Shop']);
  });
});
