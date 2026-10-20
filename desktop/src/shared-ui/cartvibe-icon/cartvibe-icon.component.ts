import { Component, input } from "@angular/core";

/**
 * The CartVibe app icon: a cart carrying three green bars and a rising blue arrow, on a purple rounded square.
 * The drawing is the traced artwork (`MQL4P01`), one path per part so each can be colored: the square and its
 * rim, the arrow, the cart, the three bars and the wheels. It is a fixed brand mark, not recolored by the
 * accent theme. It comes in a light and a dark drawing (the square, the cart and the arrow change), picked by
 * the `dark` class on `<html>` through `:host-context`.
 *
 * Whoever shows it in the page must keep it out of the page-wide dark filter (see the `app-cartvibe-logo` rule
 * in index.html): the dark drawing is already the dark one.
 */
@Component({
  selector: "app-cartvibe-icon",
  standalone: true,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="449 -3516 3301 3296"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="icon"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cv-bg" x1="0.1" y1="1" x2="0.9" y2="0" gradientUnits="objectBoundingBox">
          <stop offset="0%" stop-color="var(--cv-bg-a)" />
          <stop offset="100%" stop-color="var(--cv-bg-b)" />
        </linearGradient>
        <linearGradient id="cv-bars" x1="0" y1="1" x2="0" y2="0" gradientUnits="objectBoundingBox">
          <stop offset="0%" stop-color="#22c55e" />
          <stop offset="100%" stop-color="#15803d" />
        </linearGradient>
      </defs>

      <!-- The traced artwork is drawn y-up, so it is flipped into place. -->
      <g transform="scale(1,-1)">
        <rect x="449" y="220" width="3301" height="3296" rx="760" fill="url(#cv-bg)" />
        <rect x="470" y="241" width="3259" height="3254" rx="740" stroke="white" stroke-opacity="0.22" stroke-width="40" />

        <rect x="1625" y="1415" width="285" height="480" rx="40" fill="url(#cv-bars)" />
        <rect x="2056" y="1405" width="280" height="685" rx="40" fill="url(#cv-bars)" />
        <rect x="2485" y="1415" width="280" height="915" rx="40" fill="url(#cv-bars)" />

        <path fill="var(--cv-arrow)" d="M2918 3015 c-6 -6 -30 -12 -106 -25 -29 -5 -68 -14 -85 -19 -51 -16 -170 -41 -194 -41 -22 0 -33 -25 -14 -32 5 -1 30 -22 56 -46 l46 -44 -150 -151 c-82 -84 -158 -162 -169 -174 -11 -13 -22 -23 -25 -23 -3 0 -49 45 -103 100 -87 89 -124 117 -124 92 0 -5 -39 -48 -86 -98 -48 -49 -150 -156 -227 -239 -77 -82 -158 -167 -180 -187 -22 -21 -36 -38 -31 -39 5 0 58 0 118 1 l108 1 82 86 c167 177 237 245 244 239 4 -3 50 -49 104 -102 l96 -96 219 222 c120 122 220 226 221 231 7 19 30 7 82 -46 53 -54 74 -68 65 -42 -5 11 7 71 51 267 8 36 18 81 21 100 3 19 10 43 15 53 7 13 5 17 -10 17 -10 0 -21 -2 -24 -5z" />
        <path fill="var(--cv-cart)" stroke="var(--cv-cart)" stroke-width="130" stroke-linejoin="round" d="M870 2528 c-11 -13 -23 -33 -27 -46 -6 -26 23 -88 47 -98 8 -4 75 -8 148 -9 73 -1 134 -4 136 -6 2 -2 7 -17 10 -34 3 -16 12 -55 21 -85 9 -30 21 -75 26 -100 5 -25 13 -54 18 -65 5 -11 12 -31 14 -45 3 -14 8 -34 11 -45 3 -11 17 -60 30 -110 14 -49 26 -92 27 -95 1 -3 2 -9 3 -15 1 -5 5 -17 8 -25 6 -13 11 -37 22 -90 1 -8 5 -22 9 -30 6 -14 32 -106 58 -210 36 -141 52 -181 75 -197 22 -14 98 -16 693 -15 526 0 672 3 688 13 13 8 28 36 38 73 10 34 24 81 31 106 23 75 72 253 79 290 4 19 11 40 15 45 4 6 10 24 13 40 8 44 61 238 69 250 3 6 9 28 13 50 4 22 11 52 17 67 13 36 3 73 -27 104 -23 23 -30 24 -155 24 l-130 0 0 -89 0 -88 61 3 c55 4 61 2 56 -14 -4 -9 -19 -64 -35 -122 -17 -58 -35 -118 -41 -133 -6 -16 -11 -39 -11 -53 0 -13 -4 -32 -10 -42 -8 -16 -67 -228 -86 -315 l-9 -38 -218 -2 c-119 -1 -217 0 -217 3 0 3 -61 3 -135 0 -74 -3 -135 -3 -135 0 0 3 -101 3 -225 0 -207 -5 -225 -4 -225 12 0 9 -4 19 -9 22 -5 3 -12 27 -16 53 -5 27 -10 53 -11 58 -2 6 -5 19 -8 30 -2 11 -14 49 -25 85 -11 36 -21 75 -21 88 0 12 -5 22 -11 22 -5 0 -7 5 -3 11 3 6 2 21 -4 32 -5 12 -24 78 -42 147 -17 69 -35 131 -39 139 -5 10 18 41 77 100 l85 86 -103 3 c-106 3 -129 10 -128 40 1 9 -7 44 -17 77 -9 33 -19 75 -22 93 -3 18 -16 41 -30 52 -24 18 -41 20 -214 20 -182 0 -189 -1 -209 -22z m407 -21 c17 -17 33 -64 57 -169 19 -85 30 -94 120 -91 42 2 76 0 76 -3 0 -3 -18 -24 -39 -47 -96 -103 -90 -92 -80 -139 5 -24 13 -52 18 -63 9 -21 62 -219 66 -245 1 -8 4 -22 8 -30 3 -8 9 -26 11 -40 13 -64 25 -102 38 -117 10 -12 10 -17 1 -20 -8 -3 -9 -10 -3 -21 12 -25 32 -80 31 -87 -1 -3 7 -22 19 -43 l21 -37 222 0 c122 0 226 -2 231 -4 5 -2 45 -3 90 -1 44 1 198 3 341 4 233 1 262 3 276 18 9 10 19 14 23 10 4 -4 7 -2 5 3 -5 21 14 112 32 153 11 24 22 63 26 87 3 25 9 45 13 45 5 0 6 8 3 19 -3 10 0 22 6 25 6 4 11 17 11 29 0 12 12 58 26 102 33 106 64 224 64 247 0 18 -32 37 -61 36 -41 -3 -46 2 -52 49 -8 70 -4 74 67 71 33 -1 71 -5 84 -10 14 -5 21 -4 17 2 -3 5 8 7 27 5 35 -4 68 -36 68 -64 0 -15 -20 -98 -41 -171 -6 -19 -11 -42 -13 -50 -1 -8 -5 -22 -8 -30 -20 -49 -38 -117 -38 -141 0 -15 -7 -40 -15 -55 -8 -16 -15 -38 -15 -49 0 -12 -3 -16 -8 -8 -4 6 -7 -10 -8 -35 -1 -25 -6 -48 -13 -50 -6 -2 -9 -7 -6 -12 3 -4 -1 -25 -9 -46 -7 -22 -16 -60 -20 -86 -4 -27 -11 -48 -15 -48 -4 0 -8 -6 -8 -12 -3 -43 -26 -125 -39 -138 -13 -13 -101 -15 -676 -18 -734 -3 -695 -6 -715 64 -7 22 -22 73 -34 114 -24 82 -39 142 -43 177 -1 13 -6 26 -9 30 -4 3 -7 17 -7 30 0 13 -3 22 -7 20 -8 -5 -10 6 -16 63 -1 14 -9 30 -17 37 -8 6 -12 14 -9 18 4 3 1 27 -7 52 -8 25 -11 49 -8 54 3 5 -1 9 -8 10 -10 0 -10 2 1 6 10 4 10 7 1 13 -6 4 -15 22 -20 41 -4 19 -16 61 -25 94 -9 33 -18 65 -19 70 -2 6 -5 17 -8 25 -3 8 -11 35 -17 60 -27 100 -47 166 -54 178 -6 8 -44 12 -134 12 -100 0 -131 3 -154 17 -38 22 -43 68 -11 88 30 18 52 20 213 19 135 -1 163 -3 176 -17z" />
        <circle cx="1739" cy="930" r="205" fill="var(--cv-cart)" />
        <circle cx="2634" cy="932" r="205" fill="var(--cv-cart)" />
      </g>
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        --cv-bg-a: #aac2f4;
        --cv-bg-b: #8f6ee8;
        --cv-cart: #111c3a;
        --cv-arrow: #2563eb;
      }

      :host-context(html.dark) {
        --cv-bg-a: #5b3aa8;
        --cv-bg-b: #2a1565;
        --cv-cart: #e6e8f0;
        --cv-arrow: #4f8cff;
      }

      .icon {
        display: block;
        flex-shrink: 0;
        overflow: visible;
      }
    `,
  ],
})
export class CartVibeIconComponent {
  /** Width and height in px. */
  public readonly size = input(40);
}
