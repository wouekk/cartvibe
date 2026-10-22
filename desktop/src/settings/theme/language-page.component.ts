import { Component } from "@angular/core";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { LanguageSettingComponent } from "./language-setting.component";

/** Settings → Language (`/language`): the interface language, on a page of its own. Needs no permission. */
@Component({
  selector: "app-language-page",
  standalone: true,
  host: { class: "block" },
  imports: [SharedUiModule, LanguageSettingComponent],
  template: `
    <app-settings-page title="Language" description="The language of menus, buttons and messages.">
      <app-language-setting></app-language-setting>
    </app-settings-page>
  `,
})
export class LanguagePageComponent {}
