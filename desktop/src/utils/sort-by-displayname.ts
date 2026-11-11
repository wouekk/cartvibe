import { Injectable, inject } from "@angular/core";
import { Sort } from "../table/table-types";
import { UserStore } from "../store";

@Injectable({
  providedIn: "root",
})
export class SortByDisplayName {
  private readonly userStore = inject(UserStore);

  public sort(data: any[], sortState: Sort, userIdKey: string): any[] {
    const newData = Array.from(data);
    newData.sort((a, b) => {
      const aDisplayName =
        this.userStore.getUserById(a[userIdKey].toString())?.displayName ?? "";
      const bDisplayName =
        this.userStore.getUserById(b[userIdKey].toString())?.displayName ?? "";

      if (sortState.direction === "asc") {
        return aDisplayName.localeCompare(bDisplayName);
      } else {
        return bDisplayName.localeCompare(aDisplayName);
      }
    });

    return newData;
  }
}
