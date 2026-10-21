import { Component } from "@angular/core";

/** The Manage lists' table, drawn on the same card surface as the settings sections (hairline, no shadow). */
@Component({
  selector: "app-settings-entity-list",
  standalone: false,
  host: { class: "block min-w-0" },
  template: `
    <div class="rw-card rw-entity-list" data-testid="settings-entity-list">
      <ng-content select="[listToolbar]"></ng-content>
      <ng-content></ng-content>
    </div>
  `,
})
export class SettingsEntityListComponent {}
