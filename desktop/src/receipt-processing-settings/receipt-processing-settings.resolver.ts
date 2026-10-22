import { inject } from "@angular/core";
import { ResolveFn } from "@angular/router";
import { take, tap } from "rxjs";
import { ReceiptProcessingSettings, ReceiptProcessingSettingsService } from "../open-api";
import { setEntityHeaderText } from "../utils";
import { marker } from "../i18n/marker";
import { TranslationService } from "../i18n/translation.service";

export const receiptProcessingSettingsResolver: ResolveFn<ReceiptProcessingSettings> = (route, state) => {
  const service = inject(ReceiptProcessingSettingsService);
  const translation = inject(TranslationService);

  return service.getReceiptProcessingSettingsById(route.params["id"])
    .pipe(
      take(1),
      tap((receiptProcessingSettings) => {
        if (route.data["setHeaderText"] && route.data["formConfig"]) {
          route.data["formConfig"].headerText = setEntityHeaderText(
            receiptProcessingSettings,
            "name",
            route.data["formConfig"],
            marker("Receipt Processing Settings"),
            (text, params) => translation.t(text, params)
          );
        }

      })
    );
};
