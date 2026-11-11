import { computed, Injectable } from "@angular/core";
import { About } from "../open-api";
import { AboutStateInterface } from "./about-state.interface";
import { StateStore } from "./state-store";

/** The server's version and build date, as the About page shows them; kept between visits. */
@Injectable({ providedIn: "root" })
export class AboutStore extends StateStore<AboutStateInterface> {
  public readonly about = computed(() => this.state().about);

  constructor() {
    super(() => ({ about: { buildDate: "", version: "" } as About }), "about");
  }

  public setAbout(about: About): void {
    this.patch({ about });
  }
}
