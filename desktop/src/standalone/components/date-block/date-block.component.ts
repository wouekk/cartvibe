import { CommonModule } from "@angular/common";
import { Component, input } from "@angular/core";
import { PipesModule } from "../../../pipes/index";

@Component({
    selector: "app-date-block",
    imports: [CommonModule, PipesModule],
    templateUrl: "./date-block.component.html",
    styleUrl: "./date-block.component.scss"
})
export class DateBlockComponent {
  public readonly date = input.required<Date | string>();
}
