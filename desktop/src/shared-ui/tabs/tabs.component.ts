import { Component, OnChanges, OnInit, signal, SimpleChanges, input } from "@angular/core";
import { ActivatedRoute, NavigationEnd, Router } from "@angular/router";
import { tap } from "rxjs";
import { TabConfig } from "./tab-config.interface";

@Component({
    selector: "app-tabs",
    templateUrl: "./tabs.component.html",
    standalone: false
})
export class TabsComponent implements OnInit, OnChanges {
  public readonly tabs = input<TabConfig[]>([]);

  public activeName = signal("");

  constructor(private router: Router, private activatedRoute: ActivatedRoute) {}

  /** A tab was picked: navigate to its route, keeping the tab name in the query like the link used to. */
  public activate(name: string): void {
    const tab = this.tabs().find((candidate) => candidate.name === name);
    if (tab) {
      this.router.navigate([tab.routerLink], { relativeTo: this.activatedRoute, queryParams: { tab: tab.name } });
    }
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes["tabs"]) {
      this.setActiveTab();
    }
  }

  public ngOnInit(): void {
    this.listenToRouteChanges();
  }

  private setActiveTab(): void {
    const activeTabName = this.activatedRoute.snapshot.queryParams["tab"];

    const tabs = this.tabs();
    this.activeName.set(tabs.find(t => t.name === activeTabName)?.name || tabs[0].name);
  }

  private listenToRouteChanges(): void {
    this.router.events
      .pipe(
        tap((event) => {
          if (event instanceof NavigationEnd) {
            this.setActiveTab();
          }
        })
      )
      .subscribe();
  }
}
