import { FormOption } from "../../interfaces/form-option.interface";
import { AiType } from "../../constants/ai-type";

export const aiTypeOptions: FormOption[] = [
  {
    value: AiType.Anthropic,
    displayValue: "Claude"
  },
  {
    value: AiType.OpenAi,
    displayValue: "OpenAI"
  },
  {
    value: AiType.OpenAiCustom,
    displayValue: "OpenAI Custom",
  },
  {
    value: AiType.Gemini,
    displayValue: "Gemini",
  },
  {
    value: AiType.Ollama,
    displayValue: "Ollama",
  }
];


