import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, viewChild } from "@angular/core";

/**
 * The project site's page background, in the app: a 48px hairline grid and a soft spotlight in the palette's primary,
 * faded to `--background` at the edges. Tokens only, so it follows the palette and Day/Night.
 *
 * The host fills its positioned parent (the content panel) and sits behind its content; the parent must create a
 * stacking context (`isolate`) so the canvas paints above the panel's own background. The stage inside is sticky and one
 * screen tall, so the picture stays put while the page scrolls, clipped to the panel. On scroll the grid glides at 0.18x
 * (wrapping every 48px) and the spotlight drifts along a sine: transforms only, rAF-throttled, still under reduced motion.
 * Keep it in step with the site (`site/src/styles/global.css`, `.bg-canvas`).
 */
@Component({
  selector: "app-bg-canvas",
  standalone: true,
  host: { "aria-hidden": "true", "data-testid": "bg-canvas" },
  template: `
    <div class="stage">
      <div #glow class="glow"></div>
      <div #grid class="grid"></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        --glow-strength: 6%;
        position: absolute;
        inset: 0;
        z-index: -1;
        display: block;
        overflow: clip;
        border-radius: inherit;
        pointer-events: none;
      }
      :host-context(html.dark) {
        --glow-strength: 9%;
      }
      .stage {
        position: sticky;
        top: 0;
        height: 100svh;
        overflow: hidden;
      }
      .stage::after {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse 85% 65% at 50% 35%, transparent 15%, var(--background) 80%);
      }
      .glow {
        position: absolute;
        inset: -40px 0;
        background: radial-gradient(circle at 50% 30%, color-mix(in oklab, var(--primary) var(--glow-strength), transparent), transparent 65%);
        will-change: transform;
      }
      .grid {
        position: absolute;
        inset: -48px 0;
        background-image:
          linear-gradient(to right, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px);
        background-size: 48px 48px;
        will-change: transform;
      }
      @media (prefers-reduced-motion: reduce) {
        .glow,
        .grid {
          transform: none !important;
        }
      }
    `,
  ],
})
export class BgCanvasComponent {
  private readonly grid = viewChild.required<ElementRef<HTMLElement>>("grid");
  private readonly glow = viewChild.required<ElementRef<HTMLElement>>("glow");

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      let queued = false;
      const apply = () => {
        queued = false;
        const grid = this.grid().nativeElement;
        const glow = this.glow().nativeElement;
        if (reduce?.matches) {
          grid.style.transform = "";
          glow.style.transform = "";
          return;
        }
        const y = -(window.scrollY * 0.18) % 48;
        grid.style.transform = `translate3d(0, ${y}px, 0)`;
        glow.style.transform = `translate3d(0, ${Math.sin(window.scrollY * 0.0015) * 40}px, 0)`;
      };
      const onScroll = () => {
        if (!queued) {
          queued = true;
          requestAnimationFrame(apply);
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      reduce?.addEventListener?.("change", apply);
      apply();
      destroyRef.onDestroy(() => {
        window.removeEventListener("scroll", onScroll);
        reduce?.removeEventListener?.("change", apply);
      });
    });
  }
}
