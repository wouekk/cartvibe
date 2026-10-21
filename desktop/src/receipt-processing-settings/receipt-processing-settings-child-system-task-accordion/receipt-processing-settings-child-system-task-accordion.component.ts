import { AfterViewInit, Component, OnInit, TemplateRef, input, viewChild, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { Prompt, SystemTask, SystemTaskStatus, SystemTaskType } from "../../open-api";
import { AccordionPanel } from "../../shared-ui/accordion/accordion-panel.interface";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";

@Component({
    selector: "app-receipt-processing-settings-child-system-task-accordion",
    templateUrl: "./receipt-processing-settings-child-system-task-accordion.component.html",
    styleUrl: "./receipt-processing-settings-child-system-task-accordion.component.scss",
    standalone: false
})
export class ReceiptProcessingSettingsChildSystemTaskAccordionComponent implements OnInit, AfterViewInit {
  private readonly translation = inject(TranslationService);


  public readonly ocrProcessingDetails = viewChild.required<TemplateRef<any>>("ocrProcessingDetails");

  public readonly promptGenerationDetails = viewChild.required<TemplateRef<any>>("promptGenerationDetails");

  public readonly chatCompletionDetails = viewChild.required<TemplateRef<any>>("chatCompletionDetails");

  public readonly receiptUploadedDetails = viewChild.required<TemplateRef<any>>("receiptUploadedDetails");

  public readonly statusIcon = viewChild.required<TemplateRef<any>>("statusIcon");

  public readonly childTasks = input<SystemTask[]>([]);
  protected readonly SystemTaskType = SystemTaskType;

  protected readonly SystemTaskStatus = SystemTaskStatus;

  public accordionPanels: AccordionPanel[] = [];

  public prompts: Prompt[] = [];

  constructor(private activatedRoute: ActivatedRoute) {}

  public ngOnInit(): void {
    this.prompts = this.activatedRoute.snapshot.data["prompts"];
  }

  public ngAfterViewInit(): void {
    this.setAccordionPanels();
  }

  private setAccordionPanels(): void {
    this.childTasks().forEach(task => {
      const statusIcon = this.statusIcon();
      if (task.type === SystemTaskType.OcrProcessing) {
        this.accordionPanels.push({
          title: marker("Raw OCR Processing Details"),
          content: this.ocrProcessingDetails(),
          descriptionTemplate: statusIcon,
        });
      }

      if (task.type === SystemTaskType.PromptGenerated) {
        const prompt = this.prompts.find(p => p.id === task.associatedEntityId);
        const title = this.translation.t("Prompt Used: {name}", { name: prompt?.name });

        this.accordionPanels.push({
          title: title,
          content: this.promptGenerationDetails(),
          descriptionTemplate: statusIcon,
        });
      }

      if (task.type === SystemTaskType.ChatCompletion) {
        this.accordionPanels.push({
          title: marker("Raw Chat Completion Details"),
          content: this.chatCompletionDetails(),
          descriptionTemplate: statusIcon,
        });
      }

      if (task.type === SystemTaskType.ReceiptUploaded) {
        this.accordionPanels.push({
          title: marker("Receipt Uploaded"),
          content: this.receiptUploadedDetails(),
          descriptionTemplate: statusIcon,
        });
      }
    });
  }
}
