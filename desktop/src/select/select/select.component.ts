import { Component, Input, OnInit, inject, input } from "@angular/core";
import { OptionDisplayPipe } from "../pipes/option-display.pipe";
import { BaseInputComponent } from "../../base-input";

@Component({
    selector: "app-select",
    templateUrl: "./select.component.html",
    styleUrls: ["./select.component.scss"],
    standalone: false
})
export class SelectComponent extends BaseInputComponent implements OnInit {
  public readonly options = input<any[]>([]);

  public readonly optionsDisplayArray = input<any[]>([]);

  @Input() public optionValueKey: string = "";

  public readonly optionDisplayKey = input<string>("");

  public readonly addEmptyOption = input<boolean>(false);

  private readonly optionDisplay = inject(OptionDisplayPipe);

  constructor() {
    super();
  }

  /** The text the closed select shows for the selected value. */
  public itemToString = (value: unknown): string => {
    const index = this.options().findIndex((option) => (this.optionValueKey ? option?.[this.optionValueKey] : option) === value);
    if (index < 0) {
      return "";
    }
    // Translated like the open list (`| t` in the template), so the closed select never falls back to English.
    return this.translation.t(String(this.optionDisplay.transform(index, this.options()[index], this.optionDisplayKey(), this.optionsDisplayArray()) ?? ""));
  };

  public override ngOnInit(): void {
    super.ngOnInit();
  }
}
