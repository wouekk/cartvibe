import { Component, input, output } from "@angular/core";
import { FilterTab } from "../filter-bar/filter-tab.interface";
import { marker } from "../../i18n/marker";

/** The one segmented tab strip (control height 36px, no scrollbar) behind `app-filter-bar` and `app-tabs`. */
@Component({
  selector: "app-settings-tabs",
  standalone: false,
  host: { class: "block max-w-full min-w-0" },
  template: `
    <hlm-tabs class="max-w-full min-w-0" [tab]="value()" (tabActivated)="valueChange.emit($event)">
      <hlm-tabs-list class="max-w-full cv-scroll-x" [attr.aria-label]="ariaLabel() | t">
        @for (tab of tabs(); track tab.value) {
          <button class="filter-tab" [hlmTabsTrigger]="tab.value" [class.active]="value() === tab.value">
            @if (tab.icon) {
              <app-icon class="size-[17px] text-[17px]" [name]="tab.icon"></app-icon>
            }
            {{ tab.label | t }}
            @if (tab.count !== undefined) {
              <span class="pill rounded-full bg-secondary px-2 py-px text-[11px] font-semibold text-secondary-foreground">{{ tab.count }}</span>
            }
          </button>
        }
      </hlm-tabs-list>
    </hlm-tabs>
  `,
})
export class SettingsTabsComponent {
  public readonly tabs = input.required<FilterTab[]>();
  public readonly value = input<string>("");
  public readonly ariaLabel = input<string>(marker("Sections"));
  public readonly valueChange = output<string>();
}
