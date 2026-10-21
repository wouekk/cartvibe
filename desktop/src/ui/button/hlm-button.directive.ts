import { computed, Directive, input } from "@angular/core";
import { cva, type VariantProps } from "class-variance-authority";
import type { ClassValue } from "clsx";
import { cn } from "../cn";

/**
 * The shadcn/ui Button, as a directive (the spartan "helm" style): styles a <button> or <a>, behaviour stays native.
 * Colors come from the shadcn tokens in src/skin.css, so `default` follows the chosen accent.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium cursor-pointer select-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 no-underline [&_mat-icon]:size-5 [&_mat-icon]:text-[20px] [&_mat-icon]:leading-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90",
        outline: "border border-input bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        accentGhost: "text-accent-foreground hover:bg-accent",
        destructiveGhost: "text-destructive hover:bg-destructive/10",
        link: "text-accent-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-6",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

@Directive({
  selector: "button[hlmBtn], a[hlmBtn]",
  standalone: true,
  host: { "[class]": "computedClass()" },
})
export class HlmButtonDirective {
  public readonly variant = input<ButtonVariants["variant"]>("default");
  public readonly size = input<ButtonVariants["size"]>("default");
  public readonly userClass = input<ClassValue>("", { alias: "class" });

  protected readonly computedClass = computed(() =>
    cn(buttonVariants({ variant: this.variant(), size: this.size() }), this.userClass())
  );
}
