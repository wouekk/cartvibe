import { CdkMenu, CdkMenuTrigger } from "@angular/cdk/menu";
import { Component, Input, OnChanges, OnInit, SimpleChanges, input, output } from "@angular/core";
import { FormControl } from "@angular/forms";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatMenuItem } from "@angular/material/menu";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { tap } from "rxjs";
import { BaseButtonComponent } from "../../../button/base-button/base-button.component";
import { ButtonModule } from "../../../button/index";
import { InputModule } from "../../../input/index";
import { StatefulMenuItem } from "./stateful-menu-item";

@UntilDestroy()
@Component({
  selector: "app-filtered-stateful-menu",
  imports: [
    CdkMenuTrigger,
    CdkMenu,
    ButtonModule, InputModule, MatMenuItem, MatCheckbox,
  ],
  templateUrl: "./filtered-stateful-menu.component.html",
  styleUrl: "./filtered-stateful-menu.component.scss",
})
export class FilteredStatefulMenuComponent extends BaseButtonComponent implements OnInit, OnChanges {
  public readonly items = input<StatefulMenuItem[]>([]);

  public readonly filterFunc = input((item: StatefulMenuItem, filter: string) => item.displayValue.toLowerCase().includes(filter?.toLowerCase() ?? ""));

  public readonly filterLabel = input("Filter options");

  @Input() public headerText = "";

  public readonly readonly = input(false);

  public readonly itemSelected = output<StatefulMenuItem>();

  public filterFormControl = new FormControl();

  public filteredItems: StatefulMenuItem[] = [];

  public ngOnInit(): void {
    this.listenToFilterFormChanges();
  }

  private listenToFilterFormChanges(): void {
    this.filterFormControl.valueChanges.pipe(
      untilDestroyed(this),
      tap((filter) => {
        if (filter) {
          this.filteredItems = this.filterItems(this.items(), filter);
        } else {
          this.filteredItems = Array.from(this.items());
        }
      })
    )
      .subscribe();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes["items"].currentValue !== changes["items"].previousValue) {
      this.filteredItems = this.filterItems(changes["items"].currentValue, this.filterFormControl.value);
    }
  }

  public onItemSelected(item: StatefulMenuItem, event: MouseEvent) {
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();

    if (!this.readonly()) {
      this.itemSelected.emit(item);
    }
  }

  public resetFilter(): void {
    this.filterFormControl.setValue("");
  }

  public filterItems(items: StatefulMenuItem[], filterString: string): StatefulMenuItem[] {
    return items.filter(item => this.filterFunc()(item, filterString));
  }
}
