import { TranslatePipe } from "../../i18n/translate.pipe";
import { CommonModule } from "@angular/common";
import { Component, inject, ChangeDetectionStrategy, computed } from "@angular/core";
import { About, Permission } from "../../open-api/index";
import { AuthStore } from "../../store/auth.store";
import { AppDatePipe } from "../../pipes/app-date.pipe";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { AboutStore } from "../../store/about.store";
import { marker } from "../../i18n/marker";

interface Link {
  url: string;
  label: string;
  testId: string;
}

@Component({
    selector: "app-about",
    imports: [TranslatePipe, 
        AppDatePipe,
        CommonModule,
        SharedUiModule
    ],
    templateUrl: "./about.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: "./about.component.scss"
})
export class AboutComponent {
  private readonly authStore = inject(AuthStore);

  private readonly aboutStore = inject(AboutStore);

  public about = this.aboutStore.about;

  /** The root warning is for the person who can act on it. */
  public readonly canChangeSystemSettings = computed(() => this.authStore.hasAppPermission(Permission.AppSystemSettingsUpdate));

  public links: Link[] = [
    {
      label: marker("Source Code"),
      url: "https://github.com/wouekk/cartvibe",
      testId: "about-source-link"
    },
    {
      label: marker("Project page"),
      url: "https://cartvibe.app/",
      testId: "about-site-link"
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
  public readonly packageLicencesUrl = "3rdpartylicenses.txt";

  public readonly noticesUrl = "assets/licenses/NOTICES.txt";

}
