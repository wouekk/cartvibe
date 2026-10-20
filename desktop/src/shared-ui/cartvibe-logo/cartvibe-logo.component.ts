import { Component, input } from "@angular/core";
import { CartVibeIconComponent } from "../cartvibe-icon/cartvibe-icon.component";

/**
 * The CartVibe lockup: the app icon and the wordmark. The brand is a fixed purple (it does not follow the
 * accent theme). "Cart" is dark on a light page and white on a dark one, through the global
 * `.cv-wordmark-cart` rule in index.html (never white on white); "Vibe" is a lilac.
 *
 * The layout is plain CSS with Tailwind's `tw-` utilities alongside, so it is right even when the Tailwind CDN
 * cannot be reached.
 */
@Component({
  selector: "app-cartvibe-logo",
  standalone: true,
  imports: [CartVibeIconComponent],
  template: `
    <div class="logo tw-inline-flex tw-items-center tw-gap-2.5 tw-select-none tw-shrink-0 tw-h-10" data-testid="cartvibe-logo">
      <app-cartvibe-icon [size]="iconSize()"></app-cartvibe-icon>
      @if (showWordmark()) {
        <span class="logo__word tw-font-extrabold tw-tracking-tight tw-leading-none">
          <span class="cv-wordmark-cart">Cart</span><span class="logo__vibe">Vibe</span>
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

      .logo__word {
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1;
      }

      .logo__vibe {
        color: #8b7be0;
      }
    `,
  ],
})
export class CartVibeLogoComponent {
  /** The icon's width and height in px. */
  public readonly iconSize = input(40);

  public readonly showWordmark = input(true);
}
