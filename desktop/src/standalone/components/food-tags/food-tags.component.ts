import { Component, computed, input } from "@angular/core";
import { foodTagsOf, FoodTagValues } from "./food-tags";

/** Small, display-only health and seasonality chips. Corrections live in the host's own menu. */
@Component({
  selector: "app-food-tags",
  template: `
    @for (tag of tags(); track tag.testId) {
      <span class="food-tag food-tag--{{ tag.tone }}" [attr.data-testid]="tag.testId">{{ tag.label }}</span>
    }
  `,
  styleUrls: ["./food-tags.component.scss"],
  standalone: true,
})
export class FoodTagsComponent {
  public readonly values = input.required<FoodTagValues>();

  public readonly tags = computed(() => foodTagsOf(this.values()));
}
