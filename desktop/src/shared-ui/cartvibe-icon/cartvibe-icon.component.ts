import { Component, input } from "@angular/core";

/**
 * The CartVibe app icon (`cartvibe-logo.svg` of the identity package), drawn exactly as supplied: a purple
 * rounded square, three ascending green bars, the blue trend arrow, and the cart with its wheels. A fixed
 * brand mark, never recolored by the accent theme.
 *
 * Light and dark are the package's two palettes. In the file they switch on the operating system's
 * `prefers-color-scheme` or a `.dark` class; inline in the page they switch on the app's own `dark` class on
 * `<html>` (set by the Theme tab, System included), so a chosen Light or Dark is respected. Colors and
 * geometry are otherwise untouched.
 *
 * Keep it out of the page-wide dark filter (the `app-cartvibe-icon` rule in index.html): the dark palette is
 * already the dark one.
 */
@Component({
  selector: "app-cartvibe-icon",
  standalone: true,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      [attr.width]="size()"
      [attr.height]="size()"
      class="icon"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cv-badge-grad" x1="10%" y1="90%" x2="90%" y2="10%">
          <stop offset="0%" stop-color="var(--bg-bl)" />
          <stop offset="100%" stop-color="var(--bg-tr)" />
        </linearGradient>

        <linearGradient id="cv-bar-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="var(--bar-top)" />
          <stop offset="100%" stop-color="var(--bar-bot)" />
        </linearGradient>

        <linearGradient id="cv-arrow-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--arrow-start)" />
          <stop offset="100%" stop-color="var(--arrow-end)" />
        </linearGradient>
      </defs>

      <!-- Squircle Background -->
      <rect x="4" y="4" width="112" height="112" rx="28" fill="url(#cv-badge-grad)" />

      <!-- 3 Ascending Green Bars (Flush with Cart Floor at y=73) -->
      <g fill="url(#cv-bar-grad)">
        <rect x="43.5" y="54.5" width="9.5" height="18.5" rx="0.5" />
        <rect x="57.5" y="47.5" width="9.5" height="25.5" rx="0.5" />
        <rect x="71.5" y="39.5" width="9.5" height="33.5" rx="0.5" />
      </g>

      <!-- Blue Trend Arrow -->
      <path
        d="M 36.8 48.5
           L 54.5 30.8
           L 62.5 38.8
           L 73.5 27.8
           L 68.8 23.1
           L 86 19.5
           L 82.4 36.7
           L 77.7 32
           L 62.5 47.2
           L 54.5 39.2
           L 45.2 48.5 Z"
        fill="url(#cv-arrow-grad)"
      />

      <!-- Shopping Cart with 45-Degree Beveled Left Rim Stub -->
      <path
        d="M 19.5 32.5
           H 30.5
           C 32.5 32.5 34 33.8 34.5 35.8
           L 36.1 42
           H 40.5
           L 34 48.5
           H 37.8
           L 44 73
           H 80.5
           L 86.2 49.5
           H 83.2
           L 84.8 43
           H 90.2
           C 92.8 43 94.2 44.8 93.5 47.5
           L 86.8 76.5
           C 86.2 79 84.2 80.5 81.5 80.5
           H 42.5
           C 39.8 80.5 37.8 79 37.2 76.5
           L 27.8 39
           H 19.5
           A 3.25 3.25 0 0 1 16.25 35.75
           A 3.25 3.25 0 0 1 19.5 32.5 Z"
        fill="var(--cart-fill)"
      />

      <!-- Cart Wheels -->
      <circle cx="48" cy="91.5" r="7" fill="var(--cart-fill)" />
      <circle cx="76.5" cy="91.5" r="7" fill="var(--cart-fill)" />
    </svg>
  `,
  styles: [
    `
      /* The palette is the theme's: every theme defines the --brand-* tokens (src/themes), this only maps them. */
      :host {
        display: inline-flex;
        --bg-bl: var(--brand-badge-from, #09090b);
        --bg-tr: var(--brand-badge-to, #3f3f46);
        --cart-fill: var(--brand-cart, #fafafa);
        --bar-top: var(--brand-bar-top, #34d399);
        --bar-bot: var(--brand-bar-bottom, #10b981);
        --arrow-start: var(--brand-arrow-from, #fbbf24);
        --arrow-end: var(--brand-arrow-to, #f59e0b);
      }

      .icon {
        display: block;
        flex-shrink: 0;
      }
    `,
  ],
})
export class CartVibeIconComponent {
  /** Width and height in px (the artwork is square, 120 by 120). */
  public readonly size = input(40);
}
