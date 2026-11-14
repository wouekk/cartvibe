import { DestroyRef, Directive, ElementRef, inject, signal } from "@angular/core";

/**
 * Says whether its element's text has been cut by a line clamp (`line-clamp-3`), so a "Show all of it" button is
 * drawn only where there is more to show: `<p appClipped #text="appClipped">` and `text.clipped()`. Whether a text
 * fits depends on the width it gets, so it is measured, and measured again when the element changes size. Once
 * seen cut it stays so (with the clamp taken off nothing is cut any more, and the button must stay to put it back).
 */
@Directive({
  selector: "[appClipped]",
  exportAs: "appClipped",
  standalone: true,
})
export class ClippedDirective {
  public readonly clipped = signal(false);

  constructor() {
    const element: HTMLElement = inject(ElementRef).nativeElement;
    const observer = new ResizeObserver(() => {
      if (element.scrollHeight > element.clientHeight + 1) {
        this.clipped.set(true);
      }
    });
    observer.observe(element);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}
