import { Component, input, ChangeDetectionStrategy, inject } from "@angular/core";
import { FormControl } from "@angular/forms";
import { Group } from "../../open-api";
import { GroupStore } from "../../store";
import { AutocompleteComponent } from "../../autocomplete/autocomplete/autocomplete.component";
import { TranslatePipe } from "../../i18n/translate.pipe";

@Component({
    selector: "app-group-autocomplete",
    templateUrl: "./group-autocomplete.component.html",
    styleUrls: ["./group-autocomplete.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [AutocompleteComponent, TranslatePipe]
})
export class GroupAutocompleteComponent {
  private readonly groupStore = inject(GroupStore);

  public readonly inputFormControl = input.required<FormControl>();

  public readonly readonly = input<boolean>(false);

  public groups = this.groupStore.groupsWithoutAll;

  public groupDisplayWith(id: number): string {
    const group = this.groupStore.getGroupById(id?.toString());

    if (group) {
      return group.name;
    }
    return "";
  }
}
