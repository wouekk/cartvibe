import { SystemTaskType } from "../../open-api";
import { SystemTaskTypePipe } from "./system-task-type.pipe";

describe("SystemTaskTypePipe", () => {
  it("create an instance", () => {
    const pipe = new SystemTaskTypePipe();
    expect(pipe).toBeTruthy();
  });

  describe("transform", () => {
    const pipe = new SystemTaskTypePipe();

    const cases: Array<[SystemTaskType, string]> = [
      ["MAGIC_FILL", "Magic Fill"],
      ["QUICK_SCAN", "Quick Scan"],
      ["SYSTEM_EMAIL_CONNECTIVITY_CHECK", "System Email Connectivity Check"],
      ["RECEIPT_PROCESSING_SETTINGS_CONNECTIVITY_CHECK", "Receipt Processing Settings Connectivity Check"],
      ["EMAIL_READ", "Email Read"],
      ["EMAIL_UPLOAD", "Email Upload"],
      ["CHAT_COMPLETION", "Chat Completion"],
      ["OCR_PROCESSING", "OCR Processing"],
      ["RECEIPT_UPLOADED", "Receipt Uploaded"],
      ["PROMPT_GENERATED", "Prompt Generated"],
      ["RECEIPT_UPDATED", "Updated Receipt"],
      ["API_KEY_DELETED", "API Key Deleted"],
      ["HTML_TO_PDF", "HTML to PDF"],
    ];

    cases.forEach(([input, expected]) => {
      it(`transforms ${input} to "${expected}"`, () => {
        expect(pipe.transform(input)).toBe(expected);
      });
    });
  });
});
