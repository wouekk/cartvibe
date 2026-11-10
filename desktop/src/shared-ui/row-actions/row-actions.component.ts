import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { ButtonModule } from "../../button";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { ViewportService } from "../../services/viewport.service";
import { AppIconComponent } from "../icon/icon.component";
import { SharedUiModule } from "../shared-ui.module";

/** One action of a list row. The functions take the row, so one stable array serves every row. */
export interface RowAction<T = any> {
  key: string;
  /** Tooltip on the icon button, text of the menu item (translated here). */
  label: string;
  icon: string;
  /** Kept the same at both widths, so a spec or e2e finds the action whichever form it takes. */
  testId: string;
  /** Delete / remove: a red icon button and a red menu item. The confirmation stays the caller's. */
  destructive?: boolean;
  visible?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
}

/**
 * A settings list row's actions (DESIGN.md, Rows): inline icon buttons on a wider screen, one `more_vert` menu on a
 * phone (below 768px, the shell's phone breakpoint). Only one of the two is in the page at a time, so each test id is
 * unique. The menu items live in this component's own template (spartan dropdown items must not come from a child).
 * Bind a stable `actions` array (a field, not a fresh array per change detection) and the row as `row`.
 */
@Component({
  selector: "app-row-actions",
  // Eager: the action functions may read plain fields of the list (a disabled Delete), not only signals.
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ButtonModule, SharedUiModule, HlmButton, ...HlmDropdownMenuImports, AppIconComponent, TranslatePipe],
  host: { class: "inline-flex items-center" },
  template: `
    @if (shown().length > 0) {
      @if (isHandset()) {
        <button
          hlmBtn variant="ghost" size="icon"
          type="button"
          class="-my-1 shrink-0"
          [attr.data-testid]="menuTestId()"
          [attr.aria-label]="menuLabel()"
          [hlmDropdownMenuTrigger]="actionMenu" align="end"
        >
          <app-icon name="more_vert"></app-icon>
        </button>
        <ng-template #actionMenu>
          <div hlmDropdownMenu class="w-56">
            @for (action of shown(); track action.key) {
              <button
                hlmDropdownMenuItem
                [variant]="action.destructive ? 'destructive' : 'default'"
                [attr.data-testid]="action.testId"
                [disabled]="isDisabled(action)"
                (click)="run.emit(action.key)"
              >
                <app-icon [name]="action.icon"></app-icon>
                <span>{{ action.label | t }}</span>
              </button>
            }
          </div>
        </ng-template>
      } @else {
        <div class="flex items-center">
          @for (action of shown(); track action.key) {
            @if (action.destructive) {
              <app-delete-button
                [attr.data-testid]="action.testId"
                [tooltip]="action.label | t"
                [disabled]="isDisabled(action)"
                (clicked)="run.emit(action.key)"
              ></app-delete-button>
            } @else {
              <app-button
                [attr.data-testid]="action.testId"
                matButtonType="iconButton"
                color="accent"
                [icon]="action.icon"
                [tooltip]="action.label | t"
                [disabled]="isDisabled(action)"
                (clicked)="run.emit(action.key)"
              ></app-button>
            }
          }
        </div>
      }
    }
  `,
})
export class RowActionsComponent<T = any> {
  private readonly viewport = inject(ViewportService);

  public readonly actions = input.required<readonly RowAction<T>[]>();
  public readonly row = input.required<T>();
  /** The phone menu button's test id and accessible name (already translated: pass it through the t pipe). */
  public readonly menuTestId = input("row-menu");
  public readonly menuLabel = input("Actions");

  /** The key of the action picked. */
  public readonly run = output<string>();

  protected readonly isHandset = this.viewport.isHandset;

  /** The visible actions for this row; a function input reading a signal keeps it current. */
  public shown(): readonly RowAction<T>[] {
    const row = this.row();
    return this.actions().filter((action) => !action.visible || action.visible(row));
  }

  public isDisabled(action: RowAction<T>): boolean {
    return !!action.disabled?.(this.row());
  }
}
