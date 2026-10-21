import { FormOption } from "../../interfaces/form-option.interface";
import { AssociatedGroup } from "../../open-api";
import { marker } from "../../i18n/marker";

export const associatedGroupOptions: FormOption[] = [
  {
    value: AssociatedGroup.Mine,
    displayValue: marker("My Groups"),
  },
  {
    value: AssociatedGroup.All,
    displayValue: marker("All Groups"),
  }
];
