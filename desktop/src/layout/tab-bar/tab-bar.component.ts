import { ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideLayoutDashboard, lucideMenu, lucideReceiptText, lucideScanLine, lucideShoppingCart } from "@ng-icons/lucide";
import { TranslatePipe } from "../../i18n/translate.pipe";

/** A page the bar links to. `icon` is a Lucide name the bar provides (the three below). */
export interface TabBarItem {
  label: string;
  icon: string;
  link: (string | number)[];
  testId: string;
}

type Slot = { kind: "link"; item: TabBarItem } | { kind: "scan" } | { kind: "more" };

/** The one look of a slot: a 56px target, the icon over an 11px label, muted until it is the current page. */
const SLOT_CLASS =
  "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 text-[0.6875rem] font-medium text-muted-foreground no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset motion-reduce:transition-none aria-[current=page]:font-semibold aria-[current=page]:text-foreground";

/** A field the on-screen keyboard opens for; a checkbox or a button is not one. */
function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color", "image"].includes(target.type);
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

/**
 * The phone's navigation: the everyday pages within thumb reach, Scan raised in the middle, and More for everything
 * else (it opens the sidebar sheet). The shell renders it below 768px only, as the last child of the page column,
 * where it sticks to the bottom of the screen and takes its own room, so no page content hides behind it. It steps
 * aside while a text field has the focus: on Android the keyboard would otherwise push it up over the page.
 */
@Component({
  selector: "app-tab-bar",
  standalone: true,
  imports: [NgIcon, RouterLink, RouterLinkActive, TranslatePipe],
  providers: [provideIcons({ lucideLayoutDashboard, lucideMenu, lucideReceiptText, lucideScanLine, lucideShoppingCart })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "sticky bottom-0 z-20 mt-auto block",
    "[class.hidden]": "typing()",
    "[attr.data-state]": "typing() ? 'hidden' : 'shown'",
    "(document:focusin)": "typing.set(isTextField($event.target))",
    "(document:focusout)": "typing.set(false)",
  },
  template: `
    <nav
      class="border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      data-testid="tab-bar"
      [attr.aria-label]="'Main pages' | t"
    >
      <ul class="m-0 grid list-none auto-cols-fr grid-flow-col p-0">
        @for (slot of slots(); track $index) {
          <li class="min-w-0">
            @switch (slot.kind) {
              @case ("link") {
                <a
                  [class]="slotClass"
                  routerLinkActive
                  ariaCurrentWhenActive="page"
                  [routerLink]="slot.item.link"
                  [attr.data-testid]="'tab-' + slot.item.testId"
                >
                  <ng-icon [name]="slot.item.icon" size="20" />
                  <span class="max-w-full truncate">{{ slot.item.label | t }}</span>
                </a>
              }
              @case ("scan") {
                <button type="button" [class]="slotClass" data-testid="tab-scan" (click)="scan.emit()">
                  <span
                    class="-mt-5 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background"
                  >
                    <ng-icon name="lucideScanLine" size="22" />
                  </span>
                  <span class="max-w-full truncate">{{ 'Scan' | t }}</span>
                </button>
              }
              @case ("more") {
                <button
                  type="button"
                  aria-haspopup="dialog"
                  [class]="slotClass"
                  data-testid="tab-more"
                  (click)="more.emit()"
                >
                  <ng-icon name="lucideMenu" size="20" />
                  <span class="max-w-full truncate">{{ 'More' | t }}</span>
                </button>
              }
            }
          </li>
        }
      </ul>
    </nav>
  `,
})
export class TabBarComponent {
  /** The pages, in order; the shell passes only the ones the person may open. */
  public readonly items = input<TabBarItem[]>([]);

  /** Whether the person may scan a receipt into the household being browsed. */
  public readonly canScan = input(false);

  public readonly scan = output<void>();

  public readonly more = output<void>();

  /** Scan sits in the middle of the pages and More, so it stays under the thumb whatever the person may open. */
  protected readonly slots = computed<Slot[]>(() => {
    const slots: Slot[] = [...this.items().map((item): Slot => ({ kind: "link", item })), { kind: "more" }];
    if (this.canScan()) {
      slots.splice(Math.floor(slots.length / 2), 0, { kind: "scan" });
    }
    return slots;
  });

  protected readonly typing = signal(false);

  protected readonly slotClass = SLOT_CLASS;

  protected readonly isTextField = isTextField;
}
