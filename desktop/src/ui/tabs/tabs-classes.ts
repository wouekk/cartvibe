import { cn } from "../cn";

/** The shadcn/ui Tabs look (a muted track with a raised active pill), for the app's tab bars and segmented filters. */
export const tabsListClass =
  "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground [scrollbar-width:none]";

export function tabsTriggerClass(active: boolean): string {
  return cn(
    "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border-0 bg-transparent px-3 text-sm font-medium no-underline transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    active
      ? "bg-card text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground"
  );
}
