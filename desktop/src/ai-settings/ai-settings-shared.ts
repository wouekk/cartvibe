import { SystemTaskStatus } from "../open-api";

/** What a new household AI setting is called; a processing setting's name must be unique. */
export const AI_SETTINGS_NAME = "Household AI";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** The outcome of "Test connection", as the AI page shows it. */
export interface ConnectionResult {
  ok: boolean;
  message: string;
}

/** "Connected", or why not, from the connectivity check's system task. */
export function describeConnection(status: SystemTaskStatus | undefined, resultDescription?: string): ConnectionResult {
  if (status === SystemTaskStatus.Succeeded) {
    return { ok: true, message: "Connected. Receipts will be read by this AI." };
  }

  return {
    ok: false,
    message: `Not connected: ${resultDescription?.trim() || "no answer from the AI"}`,
  };
}
