import { Component, ElementRef, Input, OnChanges, OnInit, signal, SimpleChanges, TemplateRef, input, viewChild } from "@angular/core";
import { FormArray, FormControl, Validators } from "@angular/forms";
import { MatAutocompleteSelectedEvent, MatAutocompleteTrigger, } from "@angular/material/autocomplete";
import { map, Observable, of, startWith } from "rxjs";
import { BaseInputComponent } from "../../base-input";

@Component({
    selector: "app-autocomlete",
    templateUrl: "./autocomlete.component.html",
    styleUrls: ["./autocomlete.component.scss"],
    standalone: false
})
export class AutocomleteComponent
  extends BaseInputComponent
  implements OnInit, OnChanges {
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

  public readonly matAutocompleteTrigger = viewChild.required(MatAutocompleteTrigger);

  public readonly inputMultiple = viewChild.required<ElementRef>("inputMultiple");

  public filteredOptions: Observable<any[]> = of([]);

  public filterFormControl: FormControl = new FormControl("");

  public creatableOptionId = (Math.random() + 1).toString(36).substring(7);

  public duplicateValuesFound: any[] = [];

  public isRequired: boolean = false;

  public singleOptionSelected = signal(false);

  constructor() {
    super();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes["options"]) {
      this.filteredOptions = this.filterFormControl.valueChanges.pipe(
        startWith(this.filterFormControl.value),
        map((value) => {
          return this._filter(value);
        })
      );
    }

    if (changes["label"] && !this.inputId) {
      this.inputId = this.label.replace(/ /g, "_").toLowerCase();
    }
  }

  public override ngOnInit(): void {
    super.ngOnInit();
    this.isRequired = this.inputFormControl.hasValidator(Validators.required);
    this.setSingleOptionSelected();
    this.filteredOptions = this.filterFormControl.valueChanges.pipe(
      startWith(this.filterFormControl.value),
      map((value) => {
        return this._filter(value);
      })
    );

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

  public optionSelected(event: MatAutocompleteSelectedEvent): void {
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
        this.clearFilterAndOpenPanel();
      }, 0);
    } else {
      this.inputFormControl.setValue(event.option.value);
    }
  }

  private clearFilterAndOpenPanel(): void {
    if (this.inputId) {
      (document.getElementById(this.inputId) as any).value = "";
    }
    this.filterFormControl.setValue("");
    this.matAutocompleteTrigger().openPanel();
  }

  public removeOption(index: number) {
    if (this.multiple) {
      const formArray = this.inputFormControl as any as FormArray;
      formArray.removeAt(index);
      this.filterFormControl.setValue(null);
      this.inputMultiple().nativeElement.focus();
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
