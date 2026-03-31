import { Component, input } from "@angular/core";

@Component({
    selector: "app-pretty-json",
    templateUrl: "./pretty-json.component.html",
    styleUrl: "./pretty-json.component.scss",
    standalone: false
})
export class PrettyJsonComponent {
  public readonly json = input<string | undefined>("");

  public readonly verticalJson = input(true);
}
