import { ChangeDetectionStrategy, Component, computed, input, signal } from "@angular/core";
import { marker } from "../../i18n/marker";
import { FormControl } from "@angular/forms";
import { GROUP_COLORS, GROUP_ICONS, groupColorStyle } from "../../constants/group-look";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { ColorSwatch, ColorSwatchesComponent } from "../../shared-ui/color-swatches/color-swatches.component";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";

/**
 * Picks a household's icon and colour: two grids of toggle buttons (aria-pressed), each with a first "none" choice
 * that keeps the initial / the default colour. Every choice is a 2.75rem touch target, the grids wrap down to 360px,
 * and Tab plus the arrow keys move through a grid.
 */
@Component({
  selector: "app-group-look-picker",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, ColorSwatchesComponent, TranslatePipe],
  host: { class: "block" },
  templateUrl: "./group-look-picker.component.html",
})
export class GroupLookPickerComponent {
  public readonly iconControl = input.required<FormControl<string | null>>();
  public readonly colorControl = input.required<FormControl<string | null>>();
  public readonly readonly = input(false);
  /** The household's name, for the initial shown by the "no icon" choice. */
  public readonly name = input("");

  protected readonly icons = GROUP_ICONS;
  protected readonly defaultColour = marker("Default colour");
  protected readonly swatches: readonly ColorSwatch[] = GROUP_COLORS.map((color) => ({
    value: color.key,
    name: color.key,
    label: color.label,
    background: groupColorStyle(color.key)!.background,
    foreground: groupColorStyle(color.key)!.foreground,
  }));

  /** Bumped on every pick: the controls are not signals, so this repaints the pressed state (OnPush, zoneless). */
  private readonly picked = signal(0);

  public readonly initial = computed(() => (this.name() || "?").slice(0, 1).toUpperCase());

  public isIcon(key: string): boolean {
    this.picked();
    return (this.iconControl().value ?? "") === key;
  }

  public colorValue(): string {
    this.picked();
    return this.colorControl().value ?? "";
  }

  public pickIcon(key: string): void {
    this.pick(this.iconControl(), key);
  }

  public pickColor(key: string): void {
    this.pick(this.colorControl(), key);
  }

  private pick(control: FormControl<string | null>, key: string): void {
    if (this.readonly() || (control.value ?? "") === key) {
      return;
    }
    control.setValue(key);
    control.markAsDirty();
    this.picked.update((count) => count + 1);
  }

  /** Arrow keys move the focus to the previous or next choice of the same grid. */
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
