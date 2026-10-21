import { Component, computed, input } from "@angular/core";
import { CartVibeIconComponent } from "../cartvibe-icon/cartvibe-icon.component";

/**
 * The CartVibe lockup: the app icon (dark or light, as supplied) beside a large "CartVibe" wordmark, "Cart" in the
 * text color and "Vibe" in the brand emerald (#16C976, the banner's). It follows the app's own `dark` class like the
 * icon does. The wordmark is Geist when it is loaded (the app bundles it), then the system font.
 */
@Component({
  selector: "app-cartvibe-logo",
  standalone: true,
  imports: [CartVibeIconComponent],
  template: `
    <app-cartvibe-icon [size]="height()"></app-cartvibe-icon>
    <span
      class="wordmark"
      role="img"
      aria-label="CartVibe"
      data-testid="cartvibe-logo"
      [style.font-size.px]="fontSize()"
    >
      <span class="cart">Cart</span><span class="vibe">Vibe</span>
    </span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        gap: 0.28em;
        flex-shrink: 0;
        line-height: 1;
      }
      .wordmark {
        font-family: "Geist Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-weight: 800;
        letter-spacing: -0.035em;
        white-space: nowrap;
        margin-left: 0.28em;
      }
      .cart {
        color: #202834;
      }
      .vibe {
        color: #16c976;
      }
      :host-context(html.dark) .cart {
        color: #ffffff;
      }
    `,
  ],
})
export class CartVibeLogoComponent {
  /** The icon's height in px; the wordmark is sized from it. */
  public readonly height = input(44);

  public readonly fontSize = computed(() => Math.round(this.height() * 0.82));
}
