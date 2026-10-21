import { Component, input } from "@angular/core";

@Component({
  selector: "app-card",
  templateUrl: "./card.component.html",
  standalone: false,
})
export class CardComponent {
  public readonly cardStyle = input<string>("");
}
