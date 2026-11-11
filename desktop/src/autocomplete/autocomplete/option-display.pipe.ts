import { Pipe, PipeTransform } from "@angular/core";

// The autocomplete's own pipe. The select has another one under the same name (src/select/pipes): a component
// imports exactly one of the two.
@Pipe({ name: "optionDisplay" })
export class OptionDisplayPipe implements PipeTransform {
  public transform(
    option: any,
    options: any[],
    optionDisplayKey?: string,
    optionValueKey?: string
  ): any {
    // If we have just the value
    if (optionValueKey && optionDisplayKey) {
      return options.find(
        (o) => o?.[optionValueKey] === (option?.[optionValueKey] ?? option)
      )?.[optionDisplayKey];
    }

    // If we have the whole option object
    if (optionDisplayKey) {
      return option?.[optionDisplayKey];
    }

    return option;
  }
}
