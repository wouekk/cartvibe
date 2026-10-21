import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from "@angular/core";
import { FormControl } from "@angular/forms";
import { HlmAutocompleteImports } from "@spartan-ng/helm/autocomplete";
import { startWith } from "rxjs";
import { PipesModule } from "../../pipes/pipes.module";
import { filterItemSuggestions, ItemSuggestion } from "../shopping-item-suggestions";

/**
 * The shopping list's "Add an item" box: free text, with the household's earlier items offered as they type (spartan's
 * autocomplete). Picking one fills the name and tells the list, which also fills the amount and unit it last had.
 * Typing a new name and pressing Enter still adds it as typed.
 */
@Component({
  selector: "app-shopping-item-name-field",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...HlmAutocompleteImports, PipesModule],
  templateUrl: "./shopping-item-name-field.component.html",
  host: { class: "block" },
})
export class ShoppingItemNameFieldComponent {
  public readonly control = input.required<FormControl<string | null>>();

  public readonly suggestions = input<ItemSuggestion[]>([]);

  public readonly label = input("");

  public readonly testId = input("shopping-list-add-name");

  public readonly picked = output<ItemSuggestion>();

  /** What the box shows; follows the control, so the parent clearing it after an add clears the box too. */
  protected readonly typed = signal("");

  protected readonly options = computed(() => filterItemSuggestions(this.suggestions(), this.typed()));

  protected readonly itemToString = (value: ItemSuggestion | null): string => value?.name ?? "";

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      const subscription = control.valueChanges
        .pipe(startWith(control.value))
        .subscribe((value) => this.typed.set(value ?? ""));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected onSearch(text: string): void {
    const control = this.control();
    control.setValue(text);
    control.markAsDirty();
  }

  protected onPick(suggestion: ItemSuggestion | null): void {
    if (!suggestion) {
      return;
    }
    this.control().setValue(suggestion.name);
    this.picked.emit(suggestion);
  }
}
