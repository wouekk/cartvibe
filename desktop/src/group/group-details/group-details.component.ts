import { Component, OnInit, ChangeDetectionStrategy, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Group, Permission } from "../../open-api";
import { AuthStore } from "../../store";
import { GroupFormComponent } from "../group-form/group-form.component";

@Component({
    selector: "app-group-details",
    templateUrl: "./group-details.component.html",
    styleUrl: "./group-details.component.scss",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [GroupFormComponent]
})
export class GroupDetailsComponent implements OnInit {
  private readonly authStore = inject(AuthStore);

  public canEdit = false;

  public group!: Group;

  constructor(
    private activatedRoute: ActivatedRoute
  ) {
  }


  public ngOnInit(): void {
    this.group = this.activatedRoute.snapshot.data["group"];
    this.canEdit = this.authStore.hasGroupPermission(this.group.id, Permission.GroupUpdate, [Permission.AppGroupsUpdate]);
  }
}
