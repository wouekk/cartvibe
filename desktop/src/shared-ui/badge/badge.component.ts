import { TranslatePipe } from "../../i18n/translate.pipe";
import { Component, input, ChangeDetectionStrategy } from "@angular/core";

/** The colour a badge is drawn in. See `badge.component.scss` for the pairings. */
export type BadgeTone = "slate" | "blue" | "green";


/**
 * A small uppercase badge for marking an item in a list — a
 * column's kind, anything that needs a word of classification beside its label.
 *
 * Presentational and input-driven.
 *
 * @example
 * <app-badge text="Default"></app-badge>
 * <app-badge text="Agg" tone="blue"></app-badge>
 */
@Component({
  selector: "app-badge",
  templateUrl: "./badge.component.html",
  styleUrl: "./badge.component.scss",
  // The flex item is the host, not the span inside it, so "don't shrink me" lives here.
  host: { class: "inline-block flex-none" },
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [TranslatePipe],
})
export class BadgeComponent {
  public readonly text = input.required<string>();

  public readonly tone = input<BadgeTone>("slate");
}
