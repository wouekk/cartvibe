import { Component, HostListener, signal, ViewEncapsulation } from "@angular/core";
import { FormControl } from "@angular/forms";
import { Router } from "@angular/router";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { of, switchMap, take, tap } from "rxjs";
import { SearchResult, SearchService } from "../../open-api";

@UntilDestroy()
@Component({
    selector: "app-searchbar",
    templateUrl: "./searchbar.component.html",
    styleUrls: ["./searchbar.component.scss"],
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class SearchbarComponent {
  public results = signal<SearchResult[]>([]);

  public searchFormControl = new FormControl("");

  /** The key hint inside the field: ⌘K on a Mac, Ctrl K elsewhere ("/" works on both). */
  public readonly shortcutLabel = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "") ? "⌘K" : "Ctrl K";

  public displayWith = (searchResult: SearchResult) => {
    return searchResult?.name;
  };

  constructor(private searchService: SearchService, private router: Router) {}

  /** ⌘K / Ctrl K, or "/" outside a text field, jumps to the search box. */
  @HostListener("document:keydown", ["$event"])
  public handleShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
    if (commandK || (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey)) {
      const input = document.querySelector<HTMLInputElement>("app-searchbar input");
      if (input) {
        event.preventDefault();
        input.focus();
        input.select();
      }
    }
  }

  public ngOnInit(): void {
    this.searchFormControl.valueChanges
      .pipe(
        untilDestroyed(this),
        switchMap((value) =>
          value
            ? this.searchService.receiptSearch(value ?? "").pipe(take(1))
            : of([] as SearchResult[])
        ),
        tap((results) => {
          this.results.set(results);
        })
      )
      .subscribe();
  }

  public navigateToResult(result: SearchResult) {
    switch (result.type) {
      case "Receipt":
        this.router.navigateByUrl(`/receipts/${result.id}/view`);
        break;
    }
  }
}
