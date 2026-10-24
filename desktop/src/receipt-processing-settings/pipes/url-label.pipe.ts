import { Pipe, PipeTransform } from "@angular/core";
import { AiType } from "../../constants/ai-type";
import { marker } from "../../i18n/marker";

@Pipe({
  name: "urlLabel"
})
export class UrlLabelPipe implements PipeTransform {
  public transform(aiType: AiType): string {
    if (aiType === AiType.OpenAiCustom) {
      return marker("Base URL");
    }

    return marker("URL");
  }
}
