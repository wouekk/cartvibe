import { Component, input } from "@angular/core";
import { FormControl } from "@angular/forms";
import { Store } from "@ngxs/store";
import { Icon } from "../../open-api/index";
import { AuthState } from "../../store/index";

@Component({
    selector: "app-icon-autocomplete",
    templateUrl: "./icon-autocomplete.component.html",
    styleUrl: "./icon-autocomplete.component.scss",
    standalone: false
})
export class IconAutocompleteComponent {
  public readonly inputFormControl = input.required<FormControl>();

  public readonly label = input("");

  public icons = this.store.selectSignal(AuthState.icons);

  constructor(private store: Store) {}

  public displayWith(value: string): string {
    return this.store.selectSnapshot(AuthState.icons).find((icon) => icon.value === value)?.displayValue ?? "";
  }
}
