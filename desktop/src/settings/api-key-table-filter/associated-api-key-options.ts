import { FormOption } from "../../interfaces/form-option.interface";
import { AssociatedApiKeys } from "../../open-api";
import { marker } from "../../i18n/marker";

export const associatedApiKeyOptions: FormOption[] = [
  {
    value: AssociatedApiKeys.Mine,
    displayValue: marker("My API Keys"),
  },
  {
    value: AssociatedApiKeys.All,
    displayValue: marker("All API Keys"),
  }
];