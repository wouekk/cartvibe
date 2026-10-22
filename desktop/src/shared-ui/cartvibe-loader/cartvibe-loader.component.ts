import { Component, input } from "@angular/core";
import { TranslatePipe } from "../../i18n/translate.pipe";

/**
 * The CartVibe loaders of the identity package, drawn and animated exactly as supplied:
 *  - "badge" (`cartvibe-loader-badge.svg`, 120 by 120): on the purple rounded square, the cart floats while the
 *    bars pulse and the arrow sweeps in.
 *  - "transparent" (`cartvibe-loader-transparent.svg`, viewBox 12 15 86 84): the same without the square, for
 *    use on any surface; the cart takes the text color.
 *
 * As with the icon, light and dark are the package's palettes, switched by the app's `dark` class on `<html>`
 * (not the operating system's setting alone), so a chosen Light or Dark is respected. Keep it out of the
 * page-wide dark filter (the `app-cartvibe-loader` rule in index.html).
 */
@Component({
  selector: "app-cartvibe-loader",
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @if (variant() === "badge") {
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 120 120"
        [attr.width]="size()"
        [attr.height]="size()"
        class="loader"
        role="status"
        [attr.aria-label]="'Loading' | t"
        data-testid="cartvibe-loader"
      >
        <defs>
          <linearGradient id="ldr-badge-grad" x1="10%" y1="90%" x2="90%" y2="10%">
            <stop offset="0%" stop-color="var(--ldr-bg-bl)" />
            <stop offset="100%" stop-color="var(--ldr-bg-tr)" />
          </linearGradient>

          <linearGradient id="ldr-bar-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="var(--ldr-bar-top)" />
            <stop offset="100%" stop-color="var(--ldr-bar-bot)" />
          </linearGradient>

          <linearGradient id="ldr-arrow-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="var(--ldr-arrow-s)" />
            <stop offset="100%" stop-color="var(--ldr-arrow-e)" />
          </linearGradient>

          <clipPath id="arrow-reveal">
            <rect class="cv-arrow-clip" x="35" y="18" width="55" height="32" />
          </clipPath>
        </defs>

        <rect x="4" y="4" width="112" height="112" rx="28" fill="url(#ldr-badge-grad)" />

        <g class="cv-cart-wrap">
          <g fill="url(#ldr-bar-grad)">
            <rect class="cv-bar cv-bar-1" x="43.5" y="54.5" width="9.5" height="18.5" rx="0.5" />
            <rect class="cv-bar cv-bar-2" x="57.5" y="47.5" width="9.5" height="25.5" rx="0.5" />
            <rect class="cv-bar cv-bar-3" x="71.5" y="39.5" width="9.5" height="33.5" rx="0.5" />
          </g>

          <g clip-path="url(#arrow-reveal)">
            <path
              d="M 36.8 48.5 L 54.5 30.8 L 62.5 38.8 L 73.5 27.8 L 68.8 23.1 L 86 19.5 L 82.4 36.7 L 77.7 32 L 62.5 47.2 L 54.5 39.2 L 45.2 48.5 Z"
              fill="url(#ldr-arrow-grad)"
            />
          </g>

          <path
            d="M 19.5 32.5 H 30.5 C 32.5 32.5 34 33.8 34.5 35.8 L 36.1 42 H 40.5 L 34 48.5 H 37.8 L 44 73 H 80.5 L 86.2 49.5 H 83.2 L 84.8 43 H 90.2 C 92.8 43 94.2 44.8 93.5 47.5 L 86.8 76.5 C 86.2 79 84.2 80.5 81.5 80.5 H 42.5 C 39.8 80.5 37.8 79 37.2 76.5 L 27.8 39 H 19.5 A 3.25 3.25 0 0 1 16.25 35.75 A 3.25 3.25 0 0 1 19.5 32.5 Z"
            fill="var(--ldr-cart)"
          />

          <circle cx="48" cy="91.5" r="7" fill="var(--ldr-cart)" />
          <circle cx="76.5" cy="91.5" r="7" fill="var(--ldr-cart)" />
        </g>
      </svg>
    } @else {
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="12 15 86 84"
        [attr.width]="size()"
        [attr.height]="size()"
        class="loader loader--transparent"
        role="status"
        [attr.aria-label]="'Loading' | t"
        data-testid="cartvibe-loader"
      >
        <defs>
          <linearGradient id="t-bar-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="var(--ldr-bar-top)" />
            <stop offset="100%" stop-color="var(--ldr-bar-bot)" />
          </linearGradient>
          <linearGradient id="t-arrow-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="var(--ldr-arrow-s)" />
            <stop offset="100%" stop-color="var(--ldr-arrow-e)" />
          </linearGradient>
          <clipPath id="t-arrow-reveal">
            <rect class="cv-arrow-clip-t" x="35" y="18" width="55" height="32" />
          </clipPath>
        </defs>

        <g fill="url(#t-bar-grad)">
          <rect class="cv-bar-t cv-bar-t1" x="43.5" y="54.5" width="9.5" height="18.5" rx="0.5" />
          <rect class="cv-bar-t cv-bar-t2" x="57.5" y="47.5" width="9.5" height="25.5" rx="0.5" />
          <rect class="cv-bar-t cv-bar-t3" x="71.5" y="39.5" width="9.5" height="33.5" rx="0.5" />
        </g>

        <g clip-path="url(#t-arrow-reveal)">
          <path
            d="M 36.8 48.5 L 54.5 30.8 L 62.5 38.8 L 73.5 27.8 L 68.8 23.1 L 86 19.5 L 82.4 36.7 L 77.7 32 L 62.5 47.2 L 54.5 39.2 L 45.2 48.5 Z"
            fill="url(#t-arrow-grad)"
          />
        </g>

        <path
          d="M 19.5 32.5 H 30.5 C 32.5 32.5 34 33.8 34.5 35.8 L 36.1 42 H 40.5 L 34 48.5 H 37.8 L 44 73 H 80.5 L 86.2 49.5 H 83.2 L 84.8 43 H 90.2 C 92.8 43 94.2 44.8 93.5 47.5 L 86.8 76.5 C 86.2 79 84.2 80.5 81.5 80.5 H 42.5 C 39.8 80.5 37.8 79 37.2 76.5 L 27.8 39 H 19.5 A 3.25 3.25 0 0 1 16.25 35.75 A 3.25 3.25 0 0 1 19.5 32.5 Z"
          fill="currentColor"
        />
        <circle cx="48" cy="91.5" r="7" fill="currentColor" />
        <circle cx="76.5" cy="91.5" r="7" fill="currentColor" />
      </svg>
    }
  `,
  styles: [
    `
      /* The palette is the theme's: every theme defines the --brand-* tokens (src/themes), this only maps them. */
      :host {
        display: inline-flex;
        --ldr-bg-bl: var(--brand-badge-from, #09090b);
        --ldr-bg-tr: var(--brand-badge-to, #3f3f46);
        --ldr-cart: var(--brand-cart, #fafafa);
        --ldr-bar-top: var(--brand-bar-top, #34d399);
        --ldr-bar-bot: var(--brand-bar-bottom, #10b981);
        --ldr-arrow-s: var(--brand-arrow-from, #fbbf24);
        --ldr-arrow-e: var(--brand-arrow-to, #f59e0b);
        color: var(--brand-wordmark, #09090b);
      }

      .loader {
        display: block;
      }

      .cv-bar {
        transform-box: fill-box;
        transform-origin: bottom;
        animation: cvBarPulse 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }
      .cv-bar-1 {
        animation-delay: 0s;
      }
      .cv-bar-2 {
        animation-delay: 0.18s;
      }
      .cv-bar-3 {
        animation-delay: 0.36s;
      }

      @keyframes cvBarPulse {
        0%,
        100% {
          transform: scaleY(0.25);
          opacity: 0.75;
        }
        50% {
          transform: scaleY(1);
          opacity: 1;
        }
      }

      .cv-arrow-clip {
        animation: cvArrowSwipe 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }

      @keyframes cvArrowSwipe {
        0% {
          transform: translateX(-55px);
        }
        45%,
        80% {
          transform: translateX(0px);
        }
        100% {
          transform: translateX(55px);
        }
      }

      .cv-cart-wrap {
        transform-origin: center;
        animation: cvFloat 1.5s ease-in-out infinite;
      }

      @keyframes cvFloat {
        0%,
        100% {
          transform: translateY(0px);
        }
        50% {
          transform: translateY(-1.5px);
        }
      }

      .cv-bar-t {
        transform-box: fill-box;
        transform-origin: bottom;
        animation: cvBarPulseT 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }
      .cv-bar-t1 {
        animation-delay: 0s;
      }
      .cv-bar-t2 {
        animation-delay: 0.18s;
      }
      .cv-bar-t3 {
        animation-delay: 0.36s;
      }

      @keyframes cvBarPulseT {
        0%,
        100% {
          transform: scaleY(0.25);
          opacity: 0.75;
        }
        50% {
          transform: scaleY(1);
          opacity: 1;
        }
      }

      .cv-arrow-clip-t {
        animation: cvArrowSwipeT 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }

      @keyframes cvArrowSwipeT {
        0% {
          transform: translateX(-55px);
        }
        45%,
        80% {
          transform: translateX(0px);
        }
        100% {
          transform: translateX(55px);
        }
      }
    `,
  ],
})
export class CartVibeLoaderComponent {
  /** Width and height in px. */
  public readonly size = input(80);

  /** "badge": on the purple square. "transparent": no square, the cart in the text color. */
  public readonly variant = input<"badge" | "transparent">("badge");
}
