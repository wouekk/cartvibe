import { computed, Directive, input } from "@angular/core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

/**
 * The shadcn/ui Button, as a directive (the spartan "helm" style): styles a <button> or <a>, behaviour stays native.
 * Colors come from the shadcn tokens in src/skin.css, so `default` follows the chosen accent.
 */
export const buttonVariants = cva(
  "tw:inline-flex tw:items-center tw:justify-center tw:gap-2 tw:whitespace-nowrap tw:rounded-lg tw:text-sm tw:font-medium tw:cursor-pointer tw:select-none tw:transition-colors tw:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-ring/50 tw:disabled:pointer-events-none tw:disabled:opacity-50 tw:[&_mat-icon]:size-5 tw:[&_mat-icon]:text-[20px] tw:no-underline",
  {
    variants: {
      variant: {
        default: "tw:bg-primary tw:text-primary-foreground tw:shadow-xs tw:hover:bg-primary/90",
        destructive: "tw:bg-destructive tw:text-white tw:shadow-xs tw:hover:bg-destructive/90",
        outline: "tw:border tw:border-input tw:bg-card tw:text-foreground tw:shadow-xs tw:hover:bg-accent tw:hover:text-accent-foreground",
        secondary: "tw:bg-secondary tw:text-secondary-foreground tw:hover:bg-secondary/80",
        ghost: "tw:text-foreground tw:hover:bg-accent tw:hover:text-accent-foreground",
        accentGhost: "tw:text-accent-foreground tw:hover:bg-accent",
        link: "tw:text-accent-foreground tw:underline-offset-4 tw:hover:underline",
      },
      size: {
        default: "tw:h-10 tw:px-4 tw:py-2",
        sm: "tw:h-9 tw:px-3",
        lg: "tw:h-11 tw:px-6",
        icon: "tw:size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

@Directive({
  selector: "button[hlmBtn], a[hlmBtn]",
  standalone: true,
  host: { "[class]": "classes()" },
})
export class HlmButtonDirective {
  public readonly variant = input<ButtonVariants["variant"]>("default");
  public readonly size = input<ButtonVariants["size"]>("default");
  public readonly extraClass = input<string>("", { alias: "class" });

  protected readonly classes = computed(() =>
    cn(buttonVariants({ variant: this.variant(), size: this.size() }), this.extraClass())
  );
}
