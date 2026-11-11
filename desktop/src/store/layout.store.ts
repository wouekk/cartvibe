import { computed, Injectable } from "@angular/core";
import { StateStore } from "./state-store";

export interface LayoutStateInterface {
  /**
   * Phone only: whether the sidebar is slid in over the page. On a desktop the sidebar is always
   * shown and this is ignored.
   */
  isSidebarOpen: boolean;
  /**
   * Desktop only: the sidebar shrunk to an icon rail. Optional because a persisted layout from
   * before the labeled sidebar has no such key, which must read as expanded.
   */
  isSidebarCollapsed?: boolean;
  showProgressBar: boolean;
}

/** The shell's own state: the sidebar and the progress bar; kept between visits. */
@Injectable({ providedIn: "root" })
export class LayoutStore extends StateStore<LayoutStateInterface> {
  public readonly isSidebarOpen = computed(() => this.state().isSidebarOpen);

  public readonly isSidebarCollapsed = computed(() => this.state().isSidebarCollapsed ?? false);

  public readonly showProgressBar = computed(() => this.state().showProgressBar);

  constructor() {
    super(() => ({ isSidebarOpen: false, isSidebarCollapsed: false, showProgressBar: false }), "layout");
  }

  /** Opens or closes the phone sidebar, which slides in over the page. */
  public toggleSidebar(): void {
    this.patch({ isSidebarOpen: !this.state().isSidebarOpen });
  }

  public closeSidebar(): void {
    this.patch({ isSidebarOpen: false });
  }

  /** Switches the desktop sidebar between labeled and an icon-only rail. */
  public toggleSidebarCollapsed(): void {
    this.patch({ isSidebarCollapsed: !(this.state().isSidebarCollapsed ?? false) });
  }

  public toggleProgressBar(): void {
    this.patch({ showProgressBar: !this.state().showProgressBar });
  }

  public hideProgress(): void {
    this.patch({ showProgressBar: false });
  }

  public showProgress(): void {
    this.patch({ showProgressBar: true });
  }
}
