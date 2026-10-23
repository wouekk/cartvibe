import { Component, input, ChangeDetectionStrategy } from "@angular/core";

@Component({
  selector: "app-card",
  templateUrl: "./card.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class CardComponent {
  public readonly cardStyle = input<string>("");
}
