import { Component, Input, OnInit, inject, input, ChangeDetectionStrategy } from "@angular/core";
import { OptionDisplayPipe } from "../pipes/option-display.pipe";
import { BaseInputComponent } from "../../base-input";
import { BrnFieldControl, BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { BrnInput } from "@spartan-ng/brain/input";
import { HlmInput } from "../../ui/input/lib/hlm-input";
import { BrnSelect, BrnSelectValue, BrnSelectContent, BrnSelectItem } from "@spartan-ng/brain/select";
import { BrnPopover, BrnPopoverContent } from "@spartan-ng/brain/popover";
import { HlmSelect } from "../../ui/select/lib/hlm-select";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmSelectTrigger } from "../../ui/select/lib/hlm-select-trigger";
import { HlmSelectValue } from "../../ui/select/lib/hlm-select-value";
import { HlmSelectPortal } from "../../ui/select/lib/hlm-select-portal";
import { HlmSelectContent } from "../../ui/select/lib/hlm-select-content";
import { HlmSelectItem } from "../../ui/select/lib/hlm-select-item";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { AsyncPipe } from "@angular/common";
import { ReadonlyValuePipe } from "../pipes/readonly-value.pipe";

let nextTriggerId = 0;

@Component({
    selector: "app-select",
    templateUrl: "./select.component.html",
    styleUrls: ["./select.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [BrnFieldControl, BrnInput, BrnFieldControlDescribedBy, HlmInput, BrnSelect, BrnPopover, HlmSelect, ReactiveFormsModule, HlmSelectTrigger, BrnSelectValue, HlmSelectValue, BrnPopoverContent, HlmSelectPortal, BrnSelectContent, HlmSelectContent, BrnSelectItem, HlmSelectItem, TranslatePipe, AsyncPipe, OptionDisplayPipe, ReadonlyValuePipe]
})
export class SelectComponent extends BaseInputComponent implements OnInit {
  /** Id of the trigger button: the visible label points at it, so the combobox has an accessible name. */
  public readonly triggerId = `app-select-trigger-${nextTriggerId++}`;

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
