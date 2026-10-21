import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { RouterLink } from "@angular/router";
import { AutocompleteModule } from "../autocomplete/autocomplete.module";
import { ButtonModule } from "../button";
import { CheckboxModule } from "../checkbox/checkbox.module";
import { DirectivesModule } from "../directives";
import { InputModule } from "../input";
import { PipesModule } from "../pipes";
import { SelectModule } from "../select/select.module";
import { SharedUiModule } from "../shared-ui/shared-ui.module";
import { TableModule } from "../table/table.module";
import { AiTypePipe } from "./pipes/ai-type.pipe";
import { OcrEnginePipe } from "./pipes/ocr-engine.pipe";
import { UrlHintPipe } from "./pipes/url-hint.pipe";
import { UrlLabelPipe } from "./pipes/url-label.pipe";
import {
  ReceiptProcessingSettingsChildSystemTaskAccordionComponent
} from "./receipt-processing-settings-child-system-task-accordion/receipt-processing-settings-child-system-task-accordion.component";


@NgModule({
  declarations: [ReceiptProcessingSettingsChildSystemTaskAccordionComponent],
  imports: [
    CommonModule,
    DirectivesModule,
    TableModule,
    SharedUiModule,
    RouterLink,
    ReactiveFormsModule,
    InputModule,
    PipesModule,
    SelectModule,
    AutocompleteModule,
    AiTypePipe,
    OcrEnginePipe,
    UrlLabelPipe,
    UrlHintPipe,
    ButtonModule,
    ...HlmTooltipImports,
    CheckboxModule
  ],
  exports: [
    ReceiptProcessingSettingsChildSystemTaskAccordionComponent
  ]
})
export class ReceiptProcessingSettingsModule {
}
