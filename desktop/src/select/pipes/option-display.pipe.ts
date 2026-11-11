import { Injectable, Pipe, PipeTransform } from "@angular/core";

// The select's own pipe; the autocomplete has another one under the same name (src/autocomplete), and a component
// imports exactly one of the two. This one is also injected as a service (the select and its read-only value). It
// keeps no state, so one instance for the whole app does.
@Injectable({ providedIn: "root" })
@Pipe({ name: "optionDisplay" })
export class OptionDisplayPipe implements PipeTransform {

  public transform(index: number, option: any, optionDisplayKey: string, optionsDisplayArray?: any[]): string {
    if (optionsDisplayArray && optionsDisplayArray.length > 0) {
      return optionsDisplayArray[index];
    } else {
      return optionDisplayKey ? option[optionDisplayKey] : option;
    }
  }
}
