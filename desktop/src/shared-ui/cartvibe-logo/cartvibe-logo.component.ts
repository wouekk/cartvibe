import { Component, input } from "@angular/core";

/**
 * The CartVibe brand lockup: the app icon (a cart, a receipt, a heart with a pulse and a sparkle) and the
 * wordmark. Both follow the accent theme: the icon's gradient and the "Vibe" half of the name read
 * `--accent-color` and `--accent-hover`, so picking another accent recolors them at once. The wordmark's
 * "Cart" half follows light and dark.
 *
 * The layout is plain CSS (with Tailwind's `tw-` utilities alongside), so the lockup is right even when the
 * Tailwind CDN cannot be reached.
 */
@Component({
  selector: "app-cartvibe-logo",
  standalone: true,
  template: `
    <div class="logo tw-inline-flex tw-items-center tw-gap-2.5 tw-select-none tw-shrink-0 tw-h-8" data-testid="cartvibe-logo">
      <svg
        [attr.width]="iconSize()"
        [attr.height]="iconSize()"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="logo__icon tw-shrink-0 tw-overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <!-- Follows the theme picker. -->
          <linearGradient id="cv-squircle-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="var(--accent-color, #0071e3)" />
            <stop offset="100%" stop-color="var(--accent-hover, #5856d6)" />
          </linearGradient>
          <!-- Warm coral for the health and budget heart. -->
          <linearGradient id="cv-heart-grad" x1="22" y1="26" x2="44" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#ff7b54" />
            <stop offset="100%" stop-color="#ef4444" />
          </linearGradient>
          <filter id="cv-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.2" />
          </filter>
        </defs>

        <!-- Rounded-square base -->
        <rect x="2" y="2" width="56" height="56" rx="14" fill="url(#cv-squircle-grad)" filter="url(#cv-glow)" />
        <rect x="2.5" y="2.5" width="55" height="55" rx="13.5" stroke="white" stroke-opacity="0.28" />

        <!-- A receipt rising out of the cart, with its data lines -->
        <path d="M22 12 L25.5 14 L29 12 L32.5 14 L36 12 L39.5 14 L43 12 V34 H22 V12 Z" fill="white" fill-opacity="0.88" />
        <rect x="26" y="17.5" width="13" height="2.5" rx="1.25" fill="var(--accent-color, #0071e3)" fill-opacity="0.55" />
        <rect x="26" y="22" width="9" height="2.5" rx="1.25" fill="var(--accent-color, #0071e3)" fill-opacity="0.35" />

        <!-- Frosted cart body and wheels -->
        <path
          d="M11 19 H16.5 L21 41 H44.5 L48 25 H18"
          stroke="white"
          stroke-opacity="0.9"
          stroke-width="3.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="white"
          fill-opacity="0.18"
        />
        <circle cx="23.5" cy="48.5" r="3.5" fill="white" fill-opacity="0.9" />
        <circle cx="41.5" cy="48.5" r="3.5" fill="white" fill-opacity="0.9" />

        <!-- Heart with a pulse line -->
        <g filter="url(#cv-glow)">
          <path
            d="M32.5 44.5 C32.5 44.5 22 37.8 22 30.8 C22 27.5 24.6 25 27.8 25 C29.7 25 31.4 26 32.5 27.5 C33.6 26 35.3 25 37.2 25 C40.4 25 43 27.5 43 30.8 C43 37.8 32.5 44.5 32.5 44.5 Z"
            fill="url(#cv-heart-grad)"
          />
          <path
            d="M20 34.5 H27.5 L29.8 29.5 L32.8 39 L35.5 31.5 L37.2 34.5 H45"
            stroke="white"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>

        <!-- AI sparkle, outlined in the accent color -->
        <path
          d="M55 2 C55 7.5 56.5 9 62 9 C56.5 9 55 10.5 55 16 C55 10.5 53.5 9 48 9 C53.5 9 55 7.5 55 2 Z"
          fill="white"
          stroke="var(--accent-color, #0071e3)"
          stroke-width="1"
        />
      </svg>

      @if (showWordmark()) {
        <span class="logo__word tw-text-xl tw-font-bold tw-tracking-tight tw-leading-none">
          <span class="logo__cart tw-text-zinc-900 dark:tw-text-white tw-transition-colors tw-duration-200">Cart</span
          ><span class="logo__vibe tw-bg-clip-text tw-text-transparent tw-transition-all tw-duration-300">Vibe</span>
        </span>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .logo {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        height: 32px;
        flex-shrink: 0;
        user-select: none;
      }

      .logo__icon {
        flex-shrink: 0;
        overflow: visible;
      }

      .logo__word {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1;
      }

      .logo__cart {
        color: #18181b;
        transition: color 0.2s ease;
      }

      @media (prefers-color-scheme: dark) {
        .logo__cart {
          color: #fff;
        }
      }

      .logo__vibe {
        background-image: linear-gradient(135deg, var(--accent-color, #0071e3) 0%, var(--accent-hover, #5856d6) 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
        transition: all 0.3s ease;
      }
    `,
  ],
})
export class CartVibeLogoComponent {
  /** The icon's width and height in px. */
  public readonly iconSize = input(34);

  public readonly showWordmark = input(true);
}
