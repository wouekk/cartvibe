import { inject, Pipe, PipeTransform } from "@angular/core";
import { TranslationService } from "./translation.service";

/** `3 | plural: 'item' : 'items'`: the noun for a count, in the current language. */
@Pipe({ name: "plural", standalone: true, pure: false })
export class PluralPipe implements PipeTransform {
  private readonly translation = inject(TranslationService);

  public transform(count: number, singular: string, plural: string): string {
    return this.translation.plural(count, singular, plural);
  }
}

/** `'Add receipt' | t`: the text in the current language (impure on purpose: it follows the language signal). */
@Pipe({ name: "t", standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly translation = inject(TranslationService);

  public transform(text: string | null | undefined, params?: Record<string, string | number | null | undefined>): string {
    return text ? this.translation.t(text, params) : "";
  }
}

/**
 * `category.name | tData`: a text that came from stored data, or one the caller already translated. It reads in the
 * language only when it is exactly a catalogue text (a starter category, "Uncategorized", a key passed as is); anything
 * else is shown as written and never matched against a {placeholder} pattern (`TranslationService.data`).
 */
@Pipe({ name: "tData", standalone: true, pure: false })
export class TranslateDataPipe implements PipeTransform {
  private readonly translation = inject(TranslationService);

  public transform(text: string | null | undefined): string {
    return text ? this.translation.data(text) : "";
  }
}
