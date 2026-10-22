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
      case "SYSTEM_EMAIL_CONNECTIVITY_CHECK":
        return marker("System Email Connectivity Check");
      case "RECEIPT_PROCESSING_SETTINGS_CONNECTIVITY_CHECK":
        return marker("Receipt Processing Settings Connectivity Check");
      case "EMAIL_READ":
        return marker("Email Read");
      case "EMAIL_UPLOAD":
        return marker("Email Upload");
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
      case "API_KEY_DELETED":
        return marker("API Key Deleted");
      case "HTML_TO_PDF":
        return marker("HTML to PDF");
    }
    return "";
  }
}
