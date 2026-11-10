import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, output, signal, viewChild } from "@angular/core";
import { FormControl } from "@angular/forms";
import { BrnAutocomplete } from "@spartan-ng/brain/autocomplete";
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

  private readonly autocomplete = viewChild(BrnAutocomplete);

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      const subscription = control.valueChanges.pipe(startWith(control.value)).subscribe((value) => {
        this.typed.set(value ?? "");
        if (!value) {
          this.emptyBox();
        }
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  /**
   * Empties the box itself when the list clears the control after an add. The `[search]` binding alone is not
   * enough: the add clears the control in the same turn as the Enter that made it, and a name typed (or pasted, or
   * filled by a test) since the last paint was never bound, so the binding sees "" before and "" after and spartan
   * keeps the typed text, in the box and as its own search. Both are cleared here, the box at once (spartan would
   * only empty it on the next paint, and a next name typed before that would be appended to the old one).
   */
  private emptyBox(): void {
    this.autocomplete()?.search.set("");
    const box = this.host.nativeElement.querySelector("input");
    if (box?.value) {
      box.value = "";
    }
  }

  protected onSearch(text: string): void {
    const control = this.control();
    // The echo of `emptyBox` (and of any other change that came from the control) is not something typed.
    if (text === (control.value ?? "")) {
      return;
    }
    control.setValue(text);
    control.markAsDirty();
  }

  /**
   * spartan's input cancels every Enter so it can pick the highlighted suggestion, which also cancels the form's own
   * submit. With no suggestion highlighted, the typed name is submitted here instead.
   */
  protected submitTyped(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.getAttribute("aria-activedescendant")) {
      return;
    }
    input.form?.requestSubmit();
  }

  protected onPick(suggestion: ItemSuggestion | null | undefined): void {
    if (!suggestion) {
      return;
    }
    this.control().setValue(suggestion.name);
    this.picked.emit(suggestion);
  }
}
