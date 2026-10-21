import { Directive, ElementRef, forwardRef, HostListener, inject } from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

/** "2026-10-21" for a Date (its local calendar day), "" for anything that is not a valid date. */
export function formatDateInput(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === "string" && value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}-${month}-${day}`;
}

/** A local-midnight Date for "yyyy-MM-dd", or null for an empty or invalid text. */
export function parseDateInput(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Binds a native `<input type="date">` to a form control holding a Date (the browser's own picker, styled by the theme),
 * the way the Material datepicker did: the control sees a local-midnight Date or null, never a string.
 */
@Directive({
  selector: "input[type=date][appDateInput]",
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateInputDirective), multi: true }],
})
export class DateInputDirective implements ControlValueAccessor {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  private onChange: (value: Date | null) => void = () => {};

  private onTouched: () => void = () => {};

  public writeValue(value: unknown): void {
    this.element.value = formatDateInput(value);
  }

  public registerOnChange(fn: (value: Date | null) => void): void {
    this.onChange = fn;
  }

  public registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  public setDisabledState(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  @HostListener("input")
  public handleInput(): void {
    this.onChange(parseDateInput(this.element.value));
  }

  @HostListener("blur")
  public handleBlur(): void {
    this.onTouched();
  }
}
