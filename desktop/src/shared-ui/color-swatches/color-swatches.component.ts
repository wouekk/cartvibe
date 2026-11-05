import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { AppIconComponent } from "../icon/icon.component";

/** One swatch: the value it picks, its name (for test ids), its label (translated when drawn) and its colours. */
export interface ColorSwatch {
  value: string;
  name: string;
  label: string;
  background: string;
  foreground: string;
}

/**
 * The colour menu shared by the household picker and the profile's avatar colour: a grid of 2.75rem toggle buttons
 * (aria-pressed, a check on the chosen one) that wraps down to 360px. With `noneLabel` a first button picks "" (the
 * default look, on the primary pair). Tab plus the arrow keys move through the grid.
 */
@Component({
  selector: "app-color-swatches",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, TranslatePipe],
  host: { class: "block" },
  templateUrl: "./color-swatches.component.html",
})
export class ColorSwatchesComponent {
  public readonly swatches = input.required<readonly ColorSwatch[]>();
  public readonly value = input<string>("");
  public readonly readonly = input(false);
  /** The label of the first "default" button; without it there is none. */
  public readonly noneLabel = input<string | null>(null);
  /** The id of the element naming the grid (aria-labelledby). */
  public readonly labelledBy = input.required<string>();
  /** The grid's data-testid. */
  public readonly testId = input.required<string>();
  /** Each button's data-testid is `<buttonTestId>-<swatch name>`, `-none` for the default. */
  public readonly buttonTestId = input.required<string>();

  public readonly picked = output<string>();

  public isPicked(value: string): boolean {
    return (this.value() ?? "").toLowerCase() === value.toLowerCase();
  }

  public pick(value: string): void {
    if (!this.readonly() && !this.isPicked(value)) {
      this.picked.emit(value);
    }
  }

  /** Arrow keys move the focus to the previous or next swatch. */
  public moveFocus(event: KeyboardEvent): void {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !back) {
      return;
    }
    const button = event.target as HTMLElement;
    const choices = Array.from(button.parentElement?.querySelectorAll<HTMLElement>("button") ?? []);
    const index = choices.indexOf(button);
    const next = choices[(index + (forward ? 1 : -1) + choices.length) % choices.length];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }
}
