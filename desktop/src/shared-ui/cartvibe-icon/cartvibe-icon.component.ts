import { Component, input, ChangeDetectionStrategy } from "@angular/core";

/**
 * The CartVibe app icon, drawn exactly as supplied in `assets/brand/icon-dark.svg` and `icon-light.svg`: a rounded
 * square, three ascending emerald bars, the blue trend arrow, and the cart with its wheels. A fixed brand mark, never
 * recolored by the accent theme; the geometry and colors below are the files', untouched.
 *
 * The two files are the dark and the light version, and the one that contrasts with the page is shown: the dark icon on the
 * White theme, the light icon on the Black one. They switch on the app's own `dark` class on `<html>` (set by the Theme
 * tab, System included), so a chosen White or Black is respected.
 *
 * Keep it out of the page-wide dark filter (the `app-cartvibe-icon` rule in index.html): the dark file is already
 * the dark one.
 */
@Component({
  selector: "app-cartvibe-icon",
  standalone: true,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      [attr.width]="size()"
      [attr.height]="size()"
      class="variant-dark"
      aria-hidden="true"
      data-testid="cartvibe-icon-dark"
    >
      <defs>
        <linearGradient id="cvi-bg-dark" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#252A34" />
          <stop offset="100%" stop-color="#151920" />
        </linearGradient>
        <linearGradient id="cvi-bar-dark" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#19E68C" />
          <stop offset="100%" stop-color="#119966" />
        </linearGradient>
        <linearGradient id="cvi-arrow-dark" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0D6EFD" />
          <stop offset="100%" stop-color="#0099FF" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="115" fill="url(#cvi-bg-dark)" stroke="#383F4D" stroke-width="6" />
      <g fill="url(#cvi-bar-dark)">
        <rect x="172" y="210" width="38" height="122" rx="4" />
        <rect x="228" y="168" width="38" height="164" rx="4" />
        <rect x="284" y="128" width="38" height="204" rx="4" />
      </g>
      <g stroke="#1C2129" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M 164 306 L 236 244 L 274 282 L 368 192" />
      </g>
      <g stroke="#FFFFFF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M 88 144 H 126 L 166 332 H 332 L 352 248" />
        <path d="M 166 332 C 140 332, 140 368, 166 368 H 322" />
      </g>
      <g fill="none" stroke="#FFFFFF" stroke-width="14">
        <circle cx="188" cy="402" r="16" />
        <circle cx="300" cy="402" r="16" />
      </g>
      <g>
        <path d="M 164 306 L 236 244 L 274 282 L 368 192" stroke="url(#cvi-arrow-dark)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <polygon points="392,168 340,180 378,218" fill="url(#cvi-arrow-dark)" />
      </g>
    </svg>

    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      [attr.width]="size()"
      [attr.height]="size()"
      class="variant-light"
      aria-hidden="true"
      data-testid="cartvibe-icon-light"
    >
      <defs>
        <linearGradient id="cvi-bg-light" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="100%" stop-color="#F0F3F7" />
        </linearGradient>
        <linearGradient id="cvi-bar-light" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#19E68C" />
          <stop offset="100%" stop-color="#119966" />
        </linearGradient>
        <linearGradient id="cvi-arrow-light" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0D6EFD" />
          <stop offset="100%" stop-color="#0099FF" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="115" fill="url(#cvi-bg-light)" stroke="#D0D6DF" stroke-width="6" />
      <g fill="url(#cvi-bar-light)">
        <rect x="172" y="210" width="38" height="122" rx="4" />
        <rect x="228" y="168" width="38" height="164" rx="4" />
        <rect x="284" y="128" width="38" height="204" rx="4" />
      </g>
      <g stroke="#F8FAFC" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M 164 306 L 236 244 L 274 282 L 368 192" />
      </g>
      <g stroke="#202834" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M 88 144 H 126 L 166 332 H 332 L 352 248" />
        <path d="M 166 332 C 140 332, 140 368, 166 368 H 322" />
      </g>
      <g fill="none" stroke="#202834" stroke-width="14">
        <circle cx="188" cy="402" r="16" />
        <circle cx="300" cy="402" r="16" />
      </g>
      <g>
        <path d="M 164 306 L 236 244 L 274 282 L 368 192" stroke="url(#cvi-arrow-light)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <polygon points="392,168 340,180 378,218" fill="url(#cvi-arrow-light)" />
      </g>
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
      }
      svg {
        display: block;
      }
      /* The icon contrasts with its page: the dark icon on the White theme, the light icon on the Black one. */
      .variant-light {
        display: none;
      }
      :host-context(html.dark) .variant-light {
        display: block;
      }
      :host-context(html.dark) .variant-dark {
        display: none;
      }
    `,
  ],
})
export class CartVibeIconComponent {
  /** Width and height in px. */
  public readonly size = input(40);
}
