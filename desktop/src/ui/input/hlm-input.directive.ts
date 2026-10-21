import { computed, Directive, input } from "@angular/core";
import type { ClassValue } from "clsx";
import { cn } from "../cn";

/** The shadcn/ui Input (the spartan `hlmInput` style) for <input>, <textarea> and <select>. */
export const inputClass =
  "flex h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-muted/50 [&.ng-invalid.ng-touched]:border-destructive [&.ng-invalid.ng-touched]:focus-visible:ring-destructive/30 md:text-sm";

@Directive({
  selector: "input[hlmInput], textarea[hlmInput]",
  standalone: true,
  host: { "[class]": "computedClass()" },
})
export class HlmInputDirective {
  public readonly userClass = input<ClassValue>("", { alias: "class" });

  protected readonly computedClass = computed(() => cn(inputClass, this.userClass()));
}
