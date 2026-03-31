import { CdkVirtualScrollViewport } from "@angular/cdk/scrolling";
import { AfterViewInit, Component, Input, TemplateRef, ViewEncapsulation, input, output, viewChild } from "@angular/core";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { tap } from "rxjs";

@UntilDestroy()
@Component({
    selector: "app-dashboard-list",
    templateUrl: "./dashboard-list.component.html",
    styleUrl: "./dashboard-list.component.scss",
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class DashboardListComponent implements AfterViewInit {
  public readonly cdkVirtualScrollViewport = viewChild.required(CdkVirtualScrollViewport);

  public readonly itemHeaderTemplate = input.required<TemplateRef<any>>();

  public readonly itemLineTemplate = input.required<TemplateRef<any>>();

  @Input() public itemLineTemplate2!: TemplateRef<any>;

  @Input() public itemAvatarTemplate!: TemplateRef<any>;

  @Input() public itemMetaTemplate!: TemplateRef<any>;

  @Input() public items: any[] = [];

  public readonly noItemFoundText = input("");

  public readonly itemSize = input(67);

  public readonly buildRouterLinkString = input<(item: any) => string>((item: any) => "");

  public readonly endOfListReached = output<void>();

  public ngAfterViewInit(): void {
    this.listenForEndOfList();
  }

  private listenForEndOfList(): void {
    this.cdkVirtualScrollViewport().renderedRangeStream
      .pipe(
        untilDestroyed(this),
        tap((range) => {
          if (range.end === this.items.length) {

            this.endOfListReached.emit();
          }
        })
      )
      .subscribe();
  }
}
