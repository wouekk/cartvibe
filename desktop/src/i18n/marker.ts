/**
 * Marks an English text that is defined in TypeScript and translated later, where it is shown (column headers, option
 * labels, presets, toasts). It returns its argument and does nothing at runtime; `npm run i18n:extract` finds the call
 * and puts the text in the catalogue. Pass a plain string literal, never a template literal or a concatenation.
 */
export function marker(text: string): string {
  return text;
}
