import { PluralPipe, TranslatePipe } from "../../i18n/translate.pipe";
import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { Store } from "@ngxs/store";
import { About } from "../../open-api/index";
import { AppDatePipe } from "../../pipes/app-date.pipe";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AboutState } from "../../store/about.state";
import { FeatureConfigState } from "../../store/feature-config.state";

interface Link {
  url: string;
  label: string;
}

@Component({
    selector: "app-about",
    imports: [TranslatePipe, PluralPipe, 
        AppDatePipe,
        CommonModule,
        SharedUiModule
    ],
    templateUrl: "./about.component.html",
    styleUrl: "./about.component.scss"
})
export class AboutComponent {
  private store = inject(Store);
  public about = this.store.selectSignal(AboutState.about);

  public links: Link[] = [
    {
      label: "Documentation",
      url: "https://receiptwrangler.io"
    },
    {
      label: "Source Code",
      url: "https://github.com/Receipt-Wrangler"
    },
    {
      label: "Reddit",
      url: "https://reddit.com/r/receiptwrangler"
    }
  ];

}
