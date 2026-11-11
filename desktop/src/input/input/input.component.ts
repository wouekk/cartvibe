import { Component, Input, OnChanges, SimpleChanges, computed, input, viewChild, ChangeDetectionStrategy, inject } from "@angular/core";
import { BaseInputComponent } from "../../base-input";
import { CurrencySeparator, CurrencySymbolPosition } from "../../open-api/index";
import { PasswordGeneratorService } from "../../services/password-generator.service";
import { SystemSettingsStore } from "../../store/system-settings.store";
import { InputInterface } from "../input.interface";
import { ReactiveFormsModule } from "@angular/forms";
import { NgxMaskDirective } from "ngx-mask";
import { BrnFieldControl, BrnFieldControlDescribedBy } from "@spartan-ng/brain/field";
import { BrnInput } from "@spartan-ng/brain/input";
import { HlmInput } from "../../ui/input/lib/hlm-input";
import { BrnButton } from "@spartan-ng/brain/button";
import { HlmButton } from "../../ui/button/lib/hlm-button";
import { BrnTooltip } from "@spartan-ng/brain/tooltip";
import { HlmTooltip } from "../../ui/tooltip/lib/hlm-tooltip";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { AsyncPipe } from "@angular/common";

@Component({
    selector: "app-input",
    templateUrl: "./input.component.html",
    styleUrls: ["./input.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ReactiveFormsModule, NgxMaskDirective, BrnFieldControl, BrnInput, BrnFieldControlDescribedBy, HlmInput, BrnButton, HlmButton, BrnTooltip, HlmTooltip, AppIconComponent, TranslatePipe, AsyncPipe]
})
export class InputComponent
  extends BaseInputComponent
  implements InputInterface, OnChanges {
  private readonly systemSettingsStore = inject(SystemSettingsStore);

  public readonly nativeInput = viewChild.required<{
    nativeElement: HTMLElement;
}>("nativeInput");

  public currencyDisplay = this.systemSettingsStore.currencyDisplay;

  public currencyDecimalSeparator = this.systemSettingsStore.currencyDecimalSeparator;

  public currencyThousandthsSeparator = this.systemSettingsStore.currencyThousandthsSeparator;

  public currencySymbolPosition = this.systemSettingsStore.currencySymbolPosition;

  private static nextId = 0;

  public readonly inputId = input<string>("");

  private readonly generatedId = `app-input-${InputComponent.nextId++}`;

  /** The id the label points at: the one given, else a unique one, so every label is associated with its field. */
  public readonly fieldId = computed(() => this.inputId() || this.generatedId);

  @Input() public type: string = "text";

  @Input() public showVisibilityEye = false;

  @Input() public showGeneratePassword = false;

  public readonly isCurrency = input<boolean>(false);

  @Input() public mask: string = "";

  @Input() public maskPrefix: string = "";

  @Input() public maskSuffix: string = "";

  @Input() public thousandSeparator: string = "";

  @Input() public decimalMarker: CurrencySeparator = CurrencySeparator.Period;

  constructor(
    private passwordGeneratorService: PasswordGeneratorService
  ) {
    super();
  }


  public ngOnChanges(changes: SimpleChanges): void {
    // Either password affordance implies a password field, so mask it whenever
    // one is switched on — `changes` only carries a key that actually changed,
    // so this fires on the initial binding and on a later false -> true flip,
    // and never re-masks a field the user has revealed.
    const becamePasswordField =
      changes["showVisibilityEye"]?.currentValue ||
      changes["showGeneratePassword"]?.currentValue;
    if (becamePasswordField) {
      this.type = "password";
    }

    this.initCurrencyField();
  }

  private initCurrencyField(): void {
    if (this.isCurrency()) {
      if (this.systemSettingsStore.currencyHideDecimalPlaces()) {
        this.decimalMarker = CurrencySeparator.Period;
        this.mask = "separator.0";
      } else {
        this.decimalMarker = this.systemSettingsStore.currencyDecimalSeparator();
        this.mask = "separator.2";
      }

      this.thousandSeparator = this.systemSettingsStore.currencyThousandthsSeparator();
      if (this.systemSettingsStore.currencySymbolPosition() === CurrencySymbolPosition.Start) {
        this.maskPrefix = this.systemSettingsStore.currencyDisplay();
      }
      if (this.systemSettingsStore.currencySymbolPosition() === CurrencySymbolPosition.End) {
        this.maskSuffix = this.systemSettingsStore.currencyDisplay();
      }
    } else if (!this.mask && !this.maskPrefix && !this.maskSuffix) {
      // Only clear mask if it wasn't manually set
      this.maskPrefix = "";
      this.maskSuffix = "";
      this.thousandSeparator = "";
      this.decimalMarker = CurrencySeparator.Period;
    }
  }

  /**
   * Fills the field with a freshly generated password and reveals it so the
   * user can see what landed on their clipboard. Everything that affects the
   * view is set synchronously — under zoneless change detection only the click
   * event's change-detection pass will render it.
   */
  public generatePassword(): void {
    if (this.inputFormControl.disabled || this.readonly) {
      return;
    }

    this.inputFormControl.setValue(this.passwordGeneratorService.generateAndCopy());
    this.inputFormControl.markAsDirty();
    this.type = "text";
  }

  public toggleVisibility(): void {
    if (this.type !== "password") {
      this.type = "password";
    } else {
      this.type = "text";
    }
  }

  // TODO: Figure this out as apart of validation issues
  // private getMinValue(): string {
  //   const err = this.inputFormControl.errors as any;
  //   return err['min']['min'] ?? '0';
  // }
}
