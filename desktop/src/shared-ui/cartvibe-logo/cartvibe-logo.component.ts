import { Component, input } from "@angular/core";

/**
 * The CartVibe lockup: a rounded-square icon (a cart carrying a heart) and the wordmark. Both follow the accent
 * theme: the icon's gradient and the "Vibe" half of the name read `--accent-color` and `--accent-hover`, so
 * another accent recolors them at once. "Cart" is dark on a light page and white on a dark one, through the
 * global `.cv-wordmark-cart` rule in index.html (never white on white).
 *
 * The icon is deliberately plain (two shapes) so it reads at header size. The layout is plain CSS with
 * Tailwind's `tw-` utilities alongside, so it is right even when the Tailwind CDN cannot be reached.
 */
@Component({
  selector: "app-cartvibe-logo",
  standalone: true,
  template: `
    <div class="logo tw-inline-flex tw-items-center tw-gap-2.5 tw-select-none tw-shrink-0 tw-h-10" data-testid="cartvibe-logo">
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
          <linearGradient id="cv-squircle-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="var(--accent-color, #0086d4)" />
            <stop offset="100%" stop-color="var(--accent-hover, #0072b4)" />
          </linearGradient>
          <linearGradient id="cv-heart-grad" x1="22" y1="26" x2="44" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#ff7b54" />
            <stop offset="100%" stop-color="#ef4444" />
          </linearGradient>
        </defs>

        <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#cv-squircle-grad)" />
        <rect x="2.5" y="2.5" width="59" height="59" rx="14.5" stroke="white" stroke-opacity="0.25" />

        <!-- The cart -->
        <path
          d="M10 18 H16 L21 42 H46 L50 24 H17.5"
          stroke="white"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="white"
          fill-opacity="0.16"
        />
        <circle cx="24.5" cy="50" r="3.8" fill="white" />
        <circle cx="42.5" cy="50" r="3.8" fill="white" />

        <!-- The heart it carries -->
        <path
          d="M33.5 40 C33.5 40 24 34 24 28 C24 25 26.3 23 29 23 C30.8 23 32.5 24 33.5 25.4 C34.5 24 36.2 23 38 23 C40.7 23 43 25 43 28 C43 34 33.5 40 33.5 40 Z"
          fill="url(#cv-heart-grad)"
        />
      </svg>

      @if (showWordmark()) {
        <span class="logo__word tw-font-extrabold tw-tracking-tight tw-leading-none">
          <span class="cv-wordmark-cart">Cart</span><span class="logo__vibe tw-bg-clip-text tw-text-transparent">Vibe</span>
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
        height: 40px;
        flex-shrink: 0;
        user-select: none;
      }

      .logo__icon {
        flex-shrink: 0;
        overflow: visible;
      }

      .logo__word {
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1;
      }

      .logo__vibe {
        background-image: linear-gradient(135deg, var(--accent-color, #0086d4) 0%, var(--accent-hover, #0072b4) 100%);
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
  public readonly iconSize = input(40);

  public readonly showWordmark = input(true);
}
