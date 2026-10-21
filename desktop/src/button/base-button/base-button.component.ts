import { Component, computed, Input, input, output } from "@angular/core";

@Component({
  selector: "app-base-button",
  standalone: false,
  templateUrl: "./base-button.component.html",
  styleUrl: "./base-button.component.scss"
})
export class BaseButtonComponent {
  public readonly buttonClass = input<string>("");

  public readonly color = input<string>("primary");

  public readonly buttonText = input<string>("");

  public readonly type = input<"button" | "menu" | "submit" | "reset">("button");

  public readonly matButtonType = input<"matRaisedButton" | "iconButton" | "basic">("matRaisedButton");

  @Input() public icon: string = "";

  @Input() public customIcon: string = "";

  public readonly disabled = input<boolean>(false);

  public readonly buttonRouterLink = input<string[]>();

  public readonly buttonQueryParams = input<any>({});

  public readonly tooltip = input<string>("");

  public readonly matBadgeContent = input<any>();

  public readonly matBadgeColor = input<"primary" | "accent" | "warn" | undefined>("primary");

  /** No badge for an empty count: nothing, an empty string or a zero (a red "0" says nothing). */
  public readonly matBadgeHidden = computed(() => {
    const content = this.matBadgeContent();
    return content === undefined || content === null || content === "" || content === 0 || content === "0";
  });

  public readonly clicked = output<MouseEvent>();
}
