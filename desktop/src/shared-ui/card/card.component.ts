import { Component, input, ChangeDetectionStrategy } from "@angular/core";
import { HlmCard } from "../../ui/card/lib/hlm-card";
import { NgClass } from "@angular/common";

@Component({
    selector: "app-card",
    templateUrl: "./card.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [HlmCard, NgClass],
})
export class CardComponent {
  public readonly cardStyle = input<string>("");
}
