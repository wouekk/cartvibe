import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";
import { AppIconComponent } from "../icon/icon.component";

/**
 * A section that opens and closes under its header (the Material expansion panel's job): the title and description are
 * projected into the header (`panelTitle`, `panelDescription`), everything else is the body.
 */
@Component({
  selector: "app-expansion-panel",
  standalone: true,
  imports: [AppIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block rounded-lg border border-border bg-card text-card-foreground" },
  template: `
    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60"
      data-testid="expansion-header"
      [attr.aria-expanded]="isExpanded()"
      (click)="toggle()"
    >
      <span class="font-medium"><ng-content select="[panelTitle]" /></span>
      <span class="ml-auto flex items-center gap-2 text-muted-foreground"><ng-content select="[panelDescription]" /></span>
      @if (!hideToggle()) {
        <app-icon
          class="shrink-0 text-muted-foreground transition-transform duration-200"
          [class.rotate-180]="isExpanded()"
          name="expand_more"
        ></app-icon>
      }
    </button>
    @if (isExpanded()) {
      <div class="animate-in fade-in-0 slide-in-from-top-1 border-t border-border px-4 py-3 duration-200" data-testid="expansion-body">
        <ng-content />
      </div>
    }
  `,
})
export class ExpansionPanelComponent {
  public readonly hideToggle = input(false, { transform: booleanAttribute });

  /** Whether the panel starts open. */
  public readonly startOpen = input<boolean>(false, { alias: "expanded" });

  public readonly opened = output<void>();

  public readonly closed = output<void>();

  private readonly isOpen = signal<boolean | null>(null);

  protected readonly isExpanded = computed(() => this.isOpen() ?? this.startOpen());

  /** The panel's state as a plain property, like the Material panel's `expanded`. */
  public get expanded(): boolean {
    return this.isExpanded();
  }

  public open(): void {
    if (!this.expanded) {
      this.isOpen.set(true);
      this.opened.emit();
    }
  }

  public close(): void {
    if (this.expanded) {
      this.isOpen.set(false);
      this.closed.emit();
    }
  }

  public toggle(): void {
    this.expanded ? this.close() : this.open();
  }
}
