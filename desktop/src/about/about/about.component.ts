import { PluralPipe, TranslatePipe } from "../../i18n/translate.pipe";
import { CommonModule } from "@angular/common";
import { Component, inject, ChangeDetectionStrategy } from "@angular/core";
import { Store } from "@ngxs/store";
import { About } from "../../open-api/index";
import { AppDatePipe } from "../../pipes/app-date.pipe";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AboutState } from "../../store/about.state";
import { FeatureConfigState } from "../../store/feature-config.state";
import { marker } from "../../i18n/marker";

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
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: "./about.component.scss"
})
export class AboutComponent {
  private store = inject(Store);
  public about = this.store.selectSignal(AboutState.about);

  public links: Link[] = [
    {
      label: marker("Source Code"),
      url: "https://github.com/wouekk/cartvibe"
    },
    {
      label: marker("Project page"),
      url: "https://wouekk.github.io/cartvibe/"
    }
  ];

  /** The original project, credited as the licence and NOTICE.md require. */
  public readonly originalProjectUrl = "https://github.com/Receipt-Wrangler/receipt-wrangler";

  public readonly originalAuthorUrl = "https://github.com/Noah231515";

  /** Shop logos come from Logo.dev, and the product check reads Open Food Facts (ODbL); both ask for a credit. */
  public readonly logoDevUrl = "https://logo.dev";

  public readonly openFoodFactsUrl = "https://world.openfoodfacts.org";

  /** The font, icons, UI sources and charts whose licences ask for a credit (texts: assets/licenses/NOTICES.txt). */
  public readonly geistUrl = "https://github.com/vercel/geist-font";

  public readonly lucideUrl = "https://lucide.dev";

  public readonly spartanUrl = "https://github.com/spartan-ng/spartan";

  public readonly chartJsUrl = "https://www.chartjs.org";

  /** Licence texts served by the app itself: the npm packages (written by the build) and the rest. */
  public readonly packageLicencesUrl = "/3rdpartylicenses.txt";

  public readonly noticesUrl = "/assets/licenses/NOTICES.txt";

}
