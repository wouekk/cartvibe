import { Component, effect, inject, Input, OnInit, signal, TemplateRef, input } from "@angular/core";
import { FormArray, FormControl, Validators } from "@angular/forms";
import { Store } from "@ngxs/store";
import { map, Observable, of, startWith } from "rxjs";
import { BaseInputComponent } from "../../base-input";
import { AuthState } from "../../store/auth.state";

/** What picking an option reports: its value, and the id of the "Add ..." entry when a new value was typed. */
export interface AutocompleteSelection {
  option: { value: any; id?: string };
}

/** Stands for the "Add <typed text>" entry among the options. */
const CREATE_SENTINEL = Symbol("create");

@Component({
    selector: "app-autocomlete",
    templateUrl: "./autocomlete.component.html",
    styleUrls: ["./autocomlete.component.scss"],
    standalone: false
})
export class AutocomleteComponent
  extends BaseInputComponent
  implements OnInit {
  @Input() public inputId: string = "";

  public readonly options = input<any[]>([]);

  @Input() public optionTemplate!: TemplateRef<any>;

  @Input() public optionChipTemplate!: TemplateRef<any>;

  public readonly optionFilterKey = input<string>("");

  @Input() public optionValueKey: string = "";

  public readonly optionDisplayKey = input<string>("");

  @Input() public multiple: boolean = false;

  public readonly displayWith = input<(value: any) => string>(() => '');

  public readonly creatable = input<boolean>(false);

  public readonly defaultCreatableObject = input<any>({});

  public readonly creatableValueKey = input<string>("");

  public readonly createSentinel = CREATE_SENTINEL;

  /** The brain autocomplete's value; reset to null after each pick so the same option can be picked again. */
  public readonly brnValue = signal<any>(null);

  public readonly panelState = signal<"open" | "closed">("closed");

  public filteredOptions: Observable<any[]> = of([]);

  public filterFormControl: FormControl = new FormControl("");

  public creatableOptionId = (Math.random() + 1).toString(36).substring(7);

  public duplicateValuesFound: any[] = [];

  public isRequired: boolean = false;

  public singleOptionSelected = signal(false);

  private readonly store = inject(Store);

  /**
   * Read here rather than taken as an input: the preference is global by
   * design, so threading it through the twenty-odd call sites would only create
   * a way for one of them to disagree with the rest.
   */
  private readonly closeOnSelect = this.store.selectSignal(
    AuthState.closeChipSelectOnSelect
  );

  private optionsEffect = effect(() => {
    this.options();
    this.filteredOptions = this.filterFormControl.valueChanges.pipe(
      startWith(this.filterFormControl.value),
      map((value) => {
        return this._filter(value);
      })
    );
  });

  constructor() {
    super();
  }

  public override ngOnInit(): void {
    super.ngOnInit();
    if (!this.inputId) {
      this.inputId = this.label.replace(/ /g, "_").toLowerCase();
    }
    this.isRequired = this.inputFormControl.hasValidator(Validators.required);
    this.setSingleOptionSelected();

    if (!this.multiple) {
      this.initSingleAutocomplete();
    }
  }

  private setSingleOptionSelected(): void {
    if (!this.multiple) {
      this.inputFormControl.valueChanges
        .pipe(startWith(this.inputFormControl.value))
        .subscribe((v) => {
          this.singleOptionSelected.set(!!v);
        });
    }
  }

  private initSingleAutocomplete(): void {
    this.filterFormControl.setValue(this.inputFormControl.value);
  }

  // Re-seeds the single-select display from the current inputFormControl value.
  // The visible field is driven by filterFormControl (rendered via displayWith)
  // and is otherwise only seeded once in ngOnInit, so a programmatic value change
  // (e.g. a parent form.patchValue) updates the value but not the shown text.
  // Callers invoke this after such a change to refresh the display. No-op in
  // multiple mode, which renders selections as chips from inputFormControl.
  public syncSingleDisplay(): void {
    if (!this.multiple) {
      this.initSingleAutocomplete();
    }
  }

  public _filter(value: string): any[] {
    value = value ?? "";
    const filterValue = value.toString()?.toLowerCase();

    if (this.multiple) {
      const formArray = this.inputFormControl as any as FormArray;
      const selectedValues = (formArray.value as any[]) ?? [];
      // TODO: Restrict the user form adding an already added value

      return this.options()
        .filter((o) => !selectedValues.includes(o))
        .filter((option) => {
          const optionFilterKey = this.optionFilterKey();
          if (optionFilterKey) {
            return option[optionFilterKey]
              .toLowerCase()
              .includes(filterValue);
          } else {
            return option.toLowerCase().includes(filterValue);
          }
        });
    } else {
      if (this.optionFilterKey()) {
        return this.options().filter((option) =>
          option[this.optionFilterKey()].toLowerCase().includes(filterValue)
        );
      } else {
        return this.options().filter((o) => o.toLowerCase().includes(filterValue));
      }
    }
  }

  /** The text the input shows: what the user typed, or the display of a programmatically set value. */
  public searchText(): string {
    const value = this.filterFormControl.value;
    if (value === null || value === undefined || value === "") {
      return "";
    }

    return typeof value === "string" ? value : this.itemToString(value);
  }

  public onSearch(text: string): void {
    this.filterFormControl.setValue(text);
  }

  /** The display text of a value: the caller's displayWith, else the option's display key. */
  public itemToString = (value: any): string => {
    if (value === CREATE_SENTINEL) {
      return String(this.filterFormControl.value ?? "");
    }

    const custom = this.displayWith()(value);
    if (custom) {
      return custom;
    }

    const displayKey = this.optionDisplayKey();
    if (this.optionValueKey && displayKey) {
      return String(this.options().find((option) => option?.[this.optionValueKey] === value)?.[displayKey] ?? "");
    }

    return String((displayKey ? value?.[displayKey] : value) ?? "");
  };

  /** The text shown for the selected value in single mode. */
  public selectedDisplay(): string {
    return this.itemToString(this.inputFormControl.value);
  }

  /** The values chosen in multiple mode, for the chips. */
  public selectedItems(): any[] {
    return (this.inputFormControl.value as any[]) ?? [];
  }

  public showCreatable(): boolean {
    const text = this.filterFormControl.value;
    return this.creatable() && typeof text === "string" && text.length > 0 && !this.filterHasMatches();
  }

  private filterHasMatches(): boolean {
    return this._filter(this.filterFormControl.value).length > 0;
  }

  /** The brain autocomplete picked a value (or the "Add" entry). */
  public onValue(value: any): void {
    if (value === null || value === undefined) {
      return;
    }

    if (value === CREATE_SENTINEL) {
      this.optionSelected({ option: { id: this.creatableOptionId, value: this.filterFormControl.value } });
    } else {
      this.optionSelected({ option: { value } });
    }
    // Back to empty, so the same option can be chosen again.
    setTimeout(() => this.brnValue.set(null), 0);
  }

  public optionSelected(event: AutocompleteSelection): void {
    if (this.multiple) {
      const customOptionSelected = event.option.id === this.creatableOptionId;
      const formArray = this.inputFormControl as any as FormArray;

      if (customOptionSelected && !this.optionValueKey) {
        formArray.push(
          new FormControl({
            ...this.defaultCreatableObject(),
            [this.creatableValueKey()]: this.filterFormControl.value,
          })
        );
      } else if (customOptionSelected && this.optionValueKey) {
        formArray.push(new FormControl(this.filterFormControl.value));
      } else {
        (this.inputFormControl as any as FormArray).push(
          new FormControl(event.option.value)
        );
      }
      setTimeout(() => {
        if (this.closeOnSelect()) {
          this.clearFilterAndClosePanel();
        } else {
          this.clearFilterAndOpenPanel();
        }
      }, 0);
    } else {
      this.inputFormControl.setValue(event.option.value);
      this.filterFormControl.setValue("");
      this.closePanel();
    }
  }

  private clearFilterInput(): void {
    if (this.inputId) {
      const input = document.getElementById(this.inputId) as HTMLInputElement | null;
      if (input) {
        input.value = "";
      }
    }
    this.filterFormControl.setValue("");
  }

  private clearFilterAndOpenPanel(): void {
    this.clearFilterInput();
    this.openPanel();
  }

  // The panel closes on selection by itself; blurring as well keeps the focus from bringing it
  // straight back when the user asked for a picker that closes after each pick.
  private clearFilterAndClosePanel(): void {
    this.clearFilterInput();
    this.closePanel();
    this.inputElement()?.blur();
  }

  public openPanel(): void {
    this.panelState.set("open");
  }

  public closePanel(): void {
    this.panelState.set("closed");
  }

  private inputElement(): HTMLInputElement | null {
    return this.inputId ? (document.getElementById(this.inputId) as HTMLInputElement | null) : null;
  }

  public removeOption(index: number) {
    if (this.multiple) {
      const formArray = this.inputFormControl as any as FormArray;
      formArray.removeAt(index);
      this.filterFormControl.setValue(null);
      this.inputElement()?.focus();
    }
  }

  public removeSingleOption(): void {
    this.clearFilter();
  }

  public clearFilter(): void {
    if (this.multiple) {
      this.inputFormControl.setValue([]);
    } else {
      this.inputFormControl.setValue(null);
    }
    this.filterFormControl.setValue("");
  }
}
