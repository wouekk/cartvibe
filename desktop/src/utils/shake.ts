/** How long the red highlight stays on a field that was left empty. */
const HIGHLIGHT_MS = 1600;

/**
 * Tells the person a required field was left empty: the field shakes once and is outlined in red for a moment,
 * and the cursor goes into it. The look is the global `.cv-shake` / `.cv-field-error` in styles.scss (under
 * reduced motion only the highlight is shown).
 */
export function shakeInvalid(element: Element | null | undefined): void {
  if (!element) {
    return;
  }

  const target = element as HTMLElement;
  shakeElement(target);
  target.classList.add("cv-field-error");

  target.querySelector<HTMLElement>("input, textarea")?.focus();

  window.setTimeout(() => target.classList.remove("cv-shake", "cv-field-error"), HIGHLIGHT_MS);
}

/** One shake and nothing else: "this cannot go any further" (a panel at its smallest or largest size). */
export function shakeElement(element: Element | null | undefined): void {
  if (!element) {
    return;
  }

  const target = element as HTMLElement;
  target.classList.remove("cv-shake");
  // Reading the layout restarts the animation when the element is shaken twice in a row.
  void target.offsetWidth;
  target.classList.add("cv-shake");
  window.setTimeout(() => target.classList.remove("cv-shake"), 600);
}
