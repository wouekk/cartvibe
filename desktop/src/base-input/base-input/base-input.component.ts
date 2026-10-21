import { Component, Input, OnInit, inject, input, output } from "@angular/core";
import { FormControl } from "@angular/forms";
import { map, Observable, startWith } from "rxjs";
import { TranslationService } from "../../i18n/translation.service";
import { VALIDATION_MESSAGES, validationParams } from "../../i18n/validation-messages";
import { BaseInputInterface } from "../base-input.interface";
import { InputErrorMessage } from "./input-error-message";

@Component({
    selector: "app-base-input",
    templateUrl: "./base-input.component.html",
    styleUrls: ["./base-input.component.scss"],
    standalone: false
})
export class BaseInputComponent implements OnInit, BaseInputInterface {
  @Input() public inputFormControl: FormControl = new FormControl();

  @Input() public label: string = "";

  @Input() public additionalErrorMessages?: { [key: string]: string };

  @Input() public readonly: boolean = false;

  @Input() public placeholder?: string;

  @Input() public hint?: string;

  public readonly appearance = input<"fill" | "outline">("fill");

  public readonly inputBlur = output<any>();

  protected readonly translation = inject(TranslationService);

  public formControlErrors!: Observable<InputErrorMessage[]>;

  public errorMessages: { [key: string]: string } = {};

  public ngOnInit(): void {
    this.errorMessages = { ...VALIDATION_MESSAGES };

    this.formControlErrors = this.inputFormControl.statusChanges.pipe(
      startWith(this.inputFormControl.status),
      map(() => {
        const errors = this.inputFormControl.errors;
        if (errors) {
          const keys = Object.keys(this.inputFormControl.errors as any);
          return keys.map((k: string) => {
            const value = errors[k];
            // A custom validator may return its own text as the error value; it is the key.
            const key = typeof value === "string" ? value : (this.errorMessages[k] ?? "");
            const params = validationParams(value);

            return {
              error: k as string,
              key,
              params,
              message: this.fill(key, params),
            };
          });
        } else {
          return [];
        }
      })
    );

    if (this.additionalErrorMessages) {
      this.errorMessages = {
        ...this.errorMessages,
        ...this.additionalErrorMessages,
      };
    }
  }

  /** The English text with the label and the error's values filled in. */
  private fill(key: string, params: Record<string, string | number>): string {
    return key.replace(/\{(\w+)\}/g, (match, name) => String(name === "label" ? this.label : (params[name] ?? match)));
  }

  /**
   * The message in the current language: the label is translated first, then the key with its values. It reads the
   * language signal, so a language switch repaints the messages at once (the errors themselves are not re-emitted).
   */
  public errorText(error: InputErrorMessage): string {
    return error.key ? this.translation.t(error.key, { ...error.params, label: this.translation.t(this.label) }) : "";
  }
}
