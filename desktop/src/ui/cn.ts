import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Tailwind is built with the "tw" prefix (src/tailwind.css), so the merger has to know it.
const twMerge = extendTailwindMerge({ prefix: "tw" });

/** Joins class names and lets the later Tailwind utility win over an earlier conflicting one (the shadcn `cn`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
