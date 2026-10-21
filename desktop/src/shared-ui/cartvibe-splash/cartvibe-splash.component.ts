import { Component, input } from "@angular/core";
import { CartVibeLoaderComponent } from "../cartvibe-loader/cartvibe-loader.component";

/**
 * The full-screen loading and "signing you in" page: the CartVibe loader drawn large, with soft rings
 * spreading out behind it, a sliding bar and a line of text. Colors follow the accent theme.
 */
@Component({
  selector: "app-cartvibe-splash",
  standalone: true,
  imports: [CartVibeLoaderComponent],
  template: `
    <div class="splash" data-testid="cartvibe-splash">
      <div class="splash__stage">
        <span class="splash__ring splash__ring--1"></span>
        <span class="splash__ring splash__ring--2"></span>
        <span class="splash__ring splash__ring--3"></span>
        <app-cartvibe-loader class="splash__loader" [size]="size()"></app-cartvibe-loader>
      </div>
      <div class="splash__bar" aria-hidden="true"><span></span></div>
      <p class="splash__text">{{ text() }}</p>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .splash {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 16px;
        background: radial-gradient(circle at 50% 42%, var(--accent-soft) 0%, transparent 62%), #f8fafc;
      }
      .splash__stage {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: min(78vw, 360px);
        height: min(78vw, 360px);
      }
      .splash__ring {
        position: absolute;
        inset: 14%;
        border-radius: 50%;
        border: 2px solid var(--accent-color, #0086d4);
        opacity: 0;
        animation: splash-ring 3.6s ease-out infinite;
      }
      .splash__ring--2 {
        animation-delay: 1.2s;
      }
      .splash__ring--3 {
        animation-delay: 2.4s;
      }
      .splash__loader {
        position: relative;
        filter: drop-shadow(0 18px 28px rgba(15, 23, 42, 0.22));
      }
      .splash__bar {
        width: min(60vw, 240px);
        height: 4px;
        margin-top: 28px;
        border-radius: 4px;
        background: var(--accent-soft);
        overflow: hidden;
      }
      .splash__bar span {
        display: block;
        width: 40%;
        height: 100%;
        border-radius: 4px;
        background: linear-gradient(90deg, var(--accent-light, #38bdf8), var(--accent-color, #0086d4));
        animation: splash-bar 1.6s ease-in-out infinite;
      }
      .splash__text {
        margin: 16px 0 0;
        color: #475569;
        font-weight: 500;
        letter-spacing: 0.04em;
        animation: splash-text 2.4s ease-in-out infinite;
      }
      @keyframes splash-ring {
        0% {
          transform: scale(0.55);
          opacity: 0.45;
        }
        100% {
          transform: scale(1.25);
          opacity: 0;
        }
      }
      @keyframes splash-bar {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(250%);
        }
      }
      @keyframes splash-text {
        0%,
        100% {
          opacity: 0.55;
        }
        50% {
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .splash__ring,
        .splash__bar span,
        .splash__text {
          animation: none;
        }
        .splash__ring {
          opacity: 0.15;
        }
      }
    `,
  ],
})
export class CartVibeSplashComponent {
  public readonly text = input("Loading...");

  /** Wide enough to own the screen: the loader is drawn 60% of the stage. */
  public readonly size = input(240);
}
