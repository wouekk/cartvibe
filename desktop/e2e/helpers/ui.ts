import type { Locator, Page } from '@playwright/test';

/**
 * A form combobox by its visible label. The autocompletes expose the label as the accessible name, but `app-select`
 * does not (its `<label>` is not associated with the trigger, so the combobox has no name), which is why a plain
 * `getByRole('combobox', { name })` finds nothing for a select. This matches either.
 */
export function comboboxNamed(scope: Page | Locator, name: string | RegExp): Locator {
  return scope
    .getByRole('combobox', { name })
    .or(scope.locator('app-select').filter({ hasText: name }).getByRole('combobox'))
    .first();
}
