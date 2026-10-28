import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/**
 * A small round sample of a palette: its primary beside its muted surface. The host carries `data-palette`, so the
 * palette's own tokens apply to it whatever palette the page is showing (src/themes, docs/themes.md).
 */
@Component({
  selector: "app-palette-swatch",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "inline-block size-5 shrink-0 rounded-full border border-border bg-[linear-gradient(135deg,var(--primary)_50%,var(--muted)_50%)]",
    "aria-hidden": "true",
    "[attr.data-palette]": "palette()",
  },
  template: "",
})
export class PaletteSwatchComponent {
  public readonly palette = input.required<string>();
}
