import { Injectable, inject } from "@angular/core";
import { UserStore, GroupStore } from "../store";

@Injectable({
  providedIn: "root",
})
export class ParameterizedDataParser {
  private readonly groupStore = inject(GroupStore);

  private readonly userStore = inject(UserStore);

  public link?: string;

  public parse(body: string): string {
    let result = "";
    const groupRegex = new RegExp("\\${(.+?)}", "g");
    result = body.replaceAll(
      groupRegex,
      this.resolveParameterisedData.bind(this)
    );
    return result;
  }

  private resolveParameterisedData(data: string): string {
    const cleanedData = this.trimUnnecessaryCharacters(data);
    const partsToResolve = cleanedData.split(":");
    return this.resolveData(partsToResolve);
  }

  private trimUnnecessaryCharacters(data: string): string {
    let result = data;
    const charactersToTrim = ["$", "{", "}"];

    charactersToTrim.forEach((c) => {
      result = result.replace(c, "");
    });

    return result;
  }

  private resolveData(parts: string[]): string {
    const idType = parts[0];
    const idDotKey = parts[1];
    const type = parts[2];

    const idKeyParts = idDotKey.split(".");
    const id = idKeyParts[0];
    const key = idKeyParts[1];

    switch (idType) {
      case "userId":
        const user = this.userStore.getUserById(id);
        if (user && key) {
          return (user as any)[key];
        }
        break;
      case "groupId":
        const group = this.groupStore.getGroupById(id);
        if (type === "link") {
          this.link = `/receipts/group/${id}`;
          return "";
        }
        if (group && key && type === "string") {
          return (group as any)[key];
        }

        break;
      case "receiptId":
        if (type === "link") {
          this.link = `/receipts/${id}/view`;
          return "";
        }

        break;
    }

    return "";
  }
}
