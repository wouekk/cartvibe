import { Component, Input, OnInit, input } from "@angular/core";
import { BaseInputComponent } from "../../base-input";

@Component({
    selector: "app-select",
    templateUrl: "./select.component.html",
    styleUrls: ["./select.component.scss"],
    standalone: false
})
export class SelectComponent extends BaseInputComponent implements OnInit {
  public readonly options = input<any[]>([]);

  public readonly optionsDisplayArray = input<any[]>([]);

  @Input() public optionValueKey: string = "";

  public readonly optionDisplayKey = input<string>("");

  public readonly addEmptyOption = input<boolean>(false);

  constructor() {
    super();
  }

  public override ngOnInit(): void {
    super.ngOnInit();
  }
}
