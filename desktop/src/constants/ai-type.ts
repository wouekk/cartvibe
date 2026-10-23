/**
 * The AI providers the API knows. `aiType` is a plain string on the contract (a new provider must never break a
 * client that does not know it yet), so these are the values this app sets, not a closed list of what it may read.
 */
export const AiType = {
  Anthropic: "ANTHROPIC",
  Gemini: "GEMINI",
  OpenAi: "OPEN_AI",
  OpenAiCustom: "OPEN_AI_CUSTOM",
  Ollama: "OLLAMA",
} as const;

export type AiType = string;
