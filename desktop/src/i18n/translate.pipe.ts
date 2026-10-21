import { inject, Pipe, PipeTransform } from "@angular/core";
import { TranslationService } from "./translation.service";

/** `'Add receipt' | t`: the text in the current language (impure on purpose: it follows the language signal). */
@Pipe({ name: "t", standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly translation = inject(TranslationService);

  public transform(text: string | null | undefined, params?: Record<string, string | number>): string {
    return text ? this.translation.t(text, params) : "";
  }
}
