import { Component, computed, effect, input, untracked, viewChild, ChangeDetectionStrategy, inject } from "@angular/core";
import { FormControl } from "@angular/forms";
import { AutocompleteComponent } from "src/autocomplete/autocomplete/autocomplete.component";
import { GroupMemberUserService } from "src/services/group-member-user.service";
import { User } from "../../open-api";
import { UserStore } from "../../store";
import { NgIf } from "@angular/common";

@Component({
    selector: "app-user-autocomplete",
    templateUrl: "./user-autocomplete.component.html",
    styleUrls: ["./user-autocomplete.component.scss"],
    providers: [GroupMemberUserService],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgIf, AutocompleteComponent]
})
export class UserAutocompleteComponent {
  private readonly userStore = inject(UserStore);

  constructor(
    private groupMemberUserService: GroupMemberUserService
  ) {}

  public readonly autocompleteComponent = viewChild(AutocompleteComponent);

  public readonly inputFormControl = input.required<FormControl>();

  public readonly label = input("");

  public readonly multiple = input<boolean>(false);

  public readonly readonly = input<boolean>(false);

  public readonly usersToOmit = input<string[]>([]);

  public readonly optionValueKey = input<string>();

  public readonly groupId = input<string>();

  public readonly selectGroupMembersOnly = input<boolean>(false);

  public readonly users = computed<User[]>(() => {
    const groupId = this.groupId();
    const usersToOmit = this.usersToOmit();

    if (groupId) {
      return this.groupMemberUserService.getUsersInGroup(groupId);
    }

    const allUsers = this.userStore.users();

    if (usersToOmit.length > 0) {
      return allUsers.filter((u) => !usersToOmit.includes(u.id.toString()));
    }

    return allUsers;
  });

  private previousGroupId: string | undefined = undefined;

  private clearFilterEffect = effect(() => {
    const groupId = this.groupId();
    const hadGroup = !!this.previousGroupId;
    this.previousGroupId = groupId;

    if (hadGroup && !groupId) {
      untracked(() => this.autocompleteComponent()?.clearFilter());
    }
  });

  public displayWith(id?: number): string {
    if (id) {
      const user = this.userStore.getUserById(id.toString());
      return user?.displayName ?? "";
    }
    return "";
  }
}
