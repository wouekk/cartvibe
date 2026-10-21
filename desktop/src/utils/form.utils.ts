import { FormGroup } from "@angular/forms";
import { FormMode } from "src/enums/form-mode.enum";
import { FormConfig } from "src/interfaces";
import { FormCommand } from "../form/index";
import { marker } from "../i18n/marker";
import { englishTranslate, TranslateFn } from "../i18n/translate-fn";

export function applyApiErrors(form: FormGroup, errors: any): void {
  const keys = Array.from(Object.keys(errors?.error));

  keys?.forEach((k) => {
    const field = form.get(k);
    if (field) {
      field.setErrors({
        ...form.errors,
        error: errors.error[k],
      });
    }
  });
}

/**
 * The header of an entity form: "View Milk", "Edit Milk Receipt Settings". The wording is a translation key per mode, so a
 * language can order the words its own way; the optional entity type is translated first.
 */
export function setEntityHeaderText(
  entity: any,
  nameKey: string,
  formConfig: FormConfig,
  entityType?: string,
  translate: TranslateFn = englishTranslate
): string {
  if (entity && entity[nameKey] && formConfig) {
    const name = entity[nameKey];
    const type = entityType ? translate(entityType) : "";
    const withType = !!entityType;
    let key = "";

    if (formConfig.mode === FormMode.view) {
      key = withType ? marker("View {name} {type}") : marker("View {name}");
    }

    if (formConfig.mode === FormMode.edit) {
      key = withType ? marker("Edit {name} {type}") : marker("Edit {name}");
    }

    if (formConfig.mode === FormMode.add) {
      key = withType ? marker("Create {name} {type}") : marker("Create {name}");
    }

    return key ? translate(key, { name, type }) : "";
  }

  return "";
}

export function applyFormCommand(form: FormGroup, formCommand: FormCommand) {
  if (formCommand.path) {
    (form.get(formCommand.path) as any)[formCommand.command](
      formCommand.payload
    );
  } else {
    (form as any)[formCommand.command](formCommand.payload);
  }
}
