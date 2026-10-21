import { hlm } from "@spartan-ng/helm/utils";

/**
 * The spartan Tabs look (hlm-tabs-list / hlm-tabs-trigger: a muted track with a raised active tab) for tab bars that
 * navigate (router links) or filter, where the brain tabs primitive, which switches panels in place, does not fit.
 */
export const navTabsListClass =
  "inline-flex h-9 w-fit max-w-full items-center justify-center overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground [scrollbar-width:none]";

export function navTabsTriggerClass(active: boolean): string {
  return hlm(
    "inline-flex h-[calc(100%-1px)] shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent bg-transparent px-2.5 py-1 text-sm font-medium no-underline outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    active
      ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
      : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
  );
}
