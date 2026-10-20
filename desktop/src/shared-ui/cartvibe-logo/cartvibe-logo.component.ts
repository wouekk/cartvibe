import { Component, computed, input } from "@angular/core";

/**
 * The CartVibe brand lockup (`gemini-svg.svg` of the identity package), drawn exactly as supplied: the app icon
 * and the "CartVibe" wordmark ("Cart" in the text color, "Vibe" in the lilac), on a 430 by 120 canvas.
 *
 * Light and dark are the package's two palettes. In the file they switch on the operating system's
 * `prefers-color-scheme` or a `.dark` class; inline in the page they switch on the app's own `dark` class on
 * `<html>` (set by the Theme tab, System included), so a chosen Light or Dark is respected. Colors, geometry and
 * type are otherwise untouched; the wordmark is Inter when it is loaded (the app bundles it), then the system font.
 *
 * Keep it out of the page-wide dark filter (the `app-cartvibe-logo` rule in index.html): the dark palette is
 * already the dark one.
 */
@Component({
  selector: "app-cartvibe-logo",
  standalone: true,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 430 120"
      [attr.width]="width()"
      [attr.height]="height()"
      class="lockup"
      role="img"
      aria-label="CartVibe"
      data-testid="cartvibe-logo"
    >
      <defs>
        <linearGradient id="logo-badge-grad" x1="10%" y1="90%" x2="90%" y2="10%">
          <stop offset="0%" stop-color="var(--logo-bg-bl)" />
          <stop offset="100%" stop-color="var(--logo-bg-tr)" />
        </linearGradient>

        <linearGradient id="logo-bar-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#18c985" />
          <stop offset="100%" stop-color="#0c9f67" />
        </linearGradient>

        <linearGradient id="logo-arrow-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#1d6bf3" />
          <stop offset="100%" stop-color="#2884ff" />
        </linearGradient>
      </defs>

      <!-- App Icon Group -->
      <g transform="translate(4, 4) scale(0.93)">
        <rect x="4" y="4" width="112" height="112" rx="28" fill="url(#logo-badge-grad)" />

        <g fill="url(#logo-bar-grad)">
          <rect x="43.5" y="54.5" width="9.5" height="18.5" rx="0.5" />
          <rect x="57.5" y="47.5" width="9.5" height="25.5" rx="0.5" />
          <rect x="71.5" y="39.5" width="9.5" height="33.5" rx="0.5" />
        </g>

        <path
          d="M 36.8 48.5 L 54.5 30.8 L 62.5 38.8 L 73.5 27.8 L 68.8 23.1 L 86 19.5 L 82.4 36.7 L 77.7 32 L 62.5 47.2 L 54.5 39.2 L 45.2 48.5 Z"
          fill="url(#logo-arrow-grad)"
        />

        <path
          d="M 19.5 32.5 H 30.5 C 32.5 32.5 34 33.8 34.5 35.8 L 36.1 42 H 40.5 L 34 48.5 H 37.8 L 44 73 H 80.5 L 86.2 49.5 H 83.2 L 84.8 43 H 90.2 C 92.8 43 94.2 44.8 93.5 47.5 L 86.8 76.5 C 86.2 79 84.2 80.5 81.5 80.5 H 42.5 C 39.8 80.5 37.8 79 37.2 76.5 L 27.8 39 H 19.5 A 3.25 3.25 0 0 1 16.25 35.75 A 3.25 3.25 0 0 1 19.5 32.5 Z"
          fill="var(--logo-cart)"
        />

        <circle cx="48" cy="91.5" r="7" fill="var(--logo-cart)" />
        <circle cx="76.5" cy="91.5" r="7" fill="var(--logo-cart)" />
      </g>

      <!-- CartVibe Typography -->
      <text x="138" y="81" class="cv-wordmark">
        <tspan fill="var(--logo-text-cart)">Cart</tspan><tspan fill="var(--logo-text-vibe)">Vibe</tspan>
      </text>
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        --logo-bg-bl: #8e78f5;
        --logo-bg-tr: #a6cafd;
        --logo-cart: #0b1325;
        --logo-text-cart: #0b1325;
        --logo-text-vibe: #8e7df6;
      }

      :host-context(html.dark) {
        --logo-bg-bl: #180d3a;
        --logo-bg-tr: #5733a5;
        --logo-cart: #e2e8f0;
        --logo-text-cart: #ffffff;
        --logo-text-vibe: #917ff8;
      }

      .lockup {
        display: block;
        flex-shrink: 0;
      }

      .cv-wordmark {
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 64px;
        font-weight: 600;
        letter-spacing: -1.5px;
      }
    `,
  ],
})
export class CartVibeLogoComponent {
  /** The lockup's height in px; its width follows the artwork's 430 by 120 proportions. */
  public readonly height = input(44);

  public readonly width = computed(() => Math.round((this.height() * 430) / 120));
}
