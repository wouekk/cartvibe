import { Pipe, PipeTransform } from "@angular/core";
import { SystemTaskType } from "../../open-api";
import { marker } from "../../i18n/marker";

@Pipe({
  name: "systemTaskType",
  standalone: true
})
export class SystemTaskTypePipe implements PipeTransform {

  public transform(value: SystemTaskType): string {
    switch (value) {
      case "MAGIC_FILL":
        return marker("Magic Fill");
      case "QUICK_SCAN":
        return marker("Quick Scan");
      case "RECEIPT_PROCESSING_SETTINGS_CONNECTIVITY_CHECK":
        return marker("Receipt Processing Settings Connectivity Check");
      case "CHAT_COMPLETION":
        return marker("Chat Completion");
      case "OCR_PROCESSING":
        return marker("OCR Processing");
      case "RECEIPT_UPLOADED":
        return marker("Receipt Uploaded");
      case "PROMPT_GENERATED":
        return marker("Prompt Generated");
      case "RECEIPT_UPDATED":
        return marker("Updated Receipt");
      case "HTML_TO_PDF":
        return marker("HTML to PDF");
    }
    return "";
  }
}
