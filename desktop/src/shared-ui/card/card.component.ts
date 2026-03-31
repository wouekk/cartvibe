import { Component, ViewEncapsulation, input } from "@angular/core";

@Component({
  selector: "app-card",
  templateUrl: "./card.component.html",
  styleUrls: ["./card.component.scss"],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class CardComponent {
  public readonly cardStyle = input<string>("");
}
