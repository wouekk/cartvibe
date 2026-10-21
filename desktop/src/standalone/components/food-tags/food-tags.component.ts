import { Component, computed, input } from "@angular/core";
import { TranslatePipe } from "../../../i18n/translate.pipe";
import { foodTagsOf, FoodTagValues } from "./food-tags";

const BASE = "inline-block whitespace-nowrap rounded-full px-[7px] py-px text-[11px] font-semibold leading-4";

const TONES: Record<string, string> = {
  good: "bg-success-text/18 text-success-text",
  medium: "bg-warning-text/22 text-warning-text",
  bad: "bg-destructive/15 text-destructive",
  neutral: "bg-accent text-foreground",
};

/** Small, display-only health and seasonality chips. Corrections live in the host's own menu. */
@Component({
  selector: "app-food-tags",
  template: `
    @for (tag of tags(); track tag.testId) {
      <span [class]="chipClass(tag.tone)" [attr.data-testid]="tag.testId">{{ tag.label | t }}</span>
    }
  `,
  host: { class: "inline-flex flex-wrap gap-1" },
  imports: [TranslatePipe],
  standalone: true,
})
export class FoodTagsComponent {
  public readonly values = input.required<FoodTagValues>();

  public readonly tags = computed(() => foodTagsOf(this.values()));

  protected chipClass(tone: string): string {
    return `${BASE} ${TONES[tone] ?? TONES["neutral"]}`;
  }
}
