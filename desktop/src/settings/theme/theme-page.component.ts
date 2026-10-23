import { Component, ChangeDetectionStrategy } from "@angular/core";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { ThemeSettingsComponent } from "./theme-settings.component";

/** Settings → Theme (`/theme`): a page of its own, so it needs no permission and sits next to Language in the sidebar. */
@Component({
  selector: "app-theme-page",
  standalone: true,
  host: { class: "block" },
  imports: [SharedUiModule, ThemeSettingsComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-settings-page title="Theme" description="How CartVibe looks on this device.">
      <app-theme-settings></app-theme-settings>
    </app-settings-page>
  `,
})
export class ThemePageComponent {}
