import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A form combobox by its visible label. `app-select` ties its `<label>` to the trigger, so this is the accessible
 * name lookup; `.first()` keeps it from tripping strict mode when a label is a substring of another.
 */
export function comboboxNamed(scope: Page | Locator, name: string | RegExp): Locator {
  return scope.getByRole('combobox', { name }).first();
}

/**
 * Sets an `app-checkbox` host (found by its data-testid) on or off. The checkbox button sits inside its label, so a
 * click on the button can toggle twice and Playwright's `check()` / `uncheck()` then report "did not change its
 * state"; clicking the label toggles once.
 */
export async function setAppCheckbox(host: Locator, on: boolean): Promise<void> {
  const box = host.getByRole('checkbox');
  if ((await box.getAttribute('aria-checked')) === String(on)) {
    return;
  }
  await host.locator('label').click();
  await (on ? expect(box).toBeChecked() : expect(box).not.toBeChecked());
}
