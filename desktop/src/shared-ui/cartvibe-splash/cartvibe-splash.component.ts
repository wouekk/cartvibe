import { Component, input, ChangeDetectionStrategy } from "@angular/core";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { marker } from "../../i18n/marker";

/**
 * The full-screen loading and "signing you in" page: the animated CartVibe banner (`assets/brand/banner-wordmark-loading.svg`),
 * a sliding bar and a line of text. The banner draws itself, so it is shown through an <img>.
 */
@Component({
  selector: "app-cartvibe-splash",
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="flex min-h-dvh flex-col items-center justify-center bg-background p-4" data-testid="cartvibe-splash">
      <img
        class="w-[min(92vw,640px)] rounded-3xl shadow-2xl"
        src="assets/brand/banner-wordmark-loading.svg"
        alt="CartVibe"
        width="1200"
        height="360"
        data-testid="cartvibe-splash-banner"
      />
      <div class="mt-7 h-1 w-[min(60vw,240px)] overflow-hidden rounded bg-muted" aria-hidden="true">
        <span class="splash-bar block h-full w-2/5 rounded bg-primary"></span>
      </div>
      <p class="mt-4 text-sm font-medium tracking-wide text-muted-foreground motion-safe:animate-pulse">{{ text() | t }}</p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host {
        display: block;
      }
      .splash-bar {
        animation: splash-bar 1.6s ease-in-out infinite;
      }
      @keyframes splash-bar {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(250%);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .splash-bar {
          animation: none;
        }
      }
    `,
  ],
})
export class CartVibeSplashComponent {
  public readonly text = input(marker("Loading..."));
}
