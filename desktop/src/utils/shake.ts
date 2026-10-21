/** How long the red highlight stays on a field that was left empty. */
const HIGHLIGHT_MS = 1600;

/**
 * Tells the person a required field was left empty: the field shakes once and is outlined in red for a moment,
 * and the cursor goes into it. The look is the global `.rw-shake` / `.rw-field-error` in styles.scss (under
 * reduced motion only the highlight is shown).
 */
export function shakeInvalid(element: Element | null | undefined): void {
  if (!element) {
    return;
  }

  const target = element as HTMLElement;
  target.classList.remove("rw-shake");
  // Reading the layout restarts the animation when the field is shaken twice in a row.
  void target.offsetWidth;
  target.classList.add("rw-shake", "rw-field-error");

  target.querySelector<HTMLElement>("input, textarea")?.focus();

  window.setTimeout(() => target.classList.remove("rw-shake", "rw-field-error"), HIGHLIGHT_MS);
}
