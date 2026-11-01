import type { Locator, Page } from '@playwright/test';

/**
 * A form combobox by its visible label. `app-select` ties its `<label>` to the trigger, so this is the accessible
 * name lookup; `.first()` keeps it from tripping strict mode when a label is a substring of another.
 */
export function comboboxNamed(scope: Page | Locator, name: string | RegExp): Locator {
  return scope.getByRole('combobox', { name }).first();
}
