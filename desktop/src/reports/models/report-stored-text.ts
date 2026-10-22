import { ReportRequestCommand } from "../../open-api";

/** Translates one stored text (`TranslationService.data`): a catalogue text reads in the language, anything else as written. */
export type StoredTextTranslateFn = (text: string) => string;

/**
 * The texts of a report a person reads and edits in the builder: its name, the document's title, intro and footer,
 * the column labels and the grouping column headings. Everything else in the command is configuration.
 */
function mapStoredTexts(command: ReportRequestCommand, map: (text: string) => string): ReportRequestCommand {
  const text = (value: string | undefined) => (value ? map(value) : value);
  const mapped: ReportRequestCommand = {
    ...command,
    columns: command.columns.map((column) => (column.label ? { ...column, label: map(column.label) } : column)),
  };
  if (command.name !== undefined) {
    mapped.name = text(command.name);
  }
  if (command.document) {
    mapped.document = { ...command.document };
    for (const key of ["title", "intro", "footer"] as const) {
      if (command.document[key] !== undefined) {
        mapped.document[key] = text(command.document[key]);
      }
    }
  }
  if (command.groupByLabels) {
    mapped.groupByLabels = Object.fromEntries(
      Object.entries(command.groupByLabels).map(([field, label]) => [field, text(label) ?? label])
    );
  }
  return mapped;
}

/**
 * A saved report as the builder shows it: the starter reports are stored in English, so their texts read in the
 * person's language here, as they do in the list and in the generated report. A text someone typed is unchanged.
 */
export function localizeStoredTexts(command: ReportRequestCommand, translate: StoredTextTranslateFn): ReportRequestCommand {
  return mapStoredTexts(command, translate);
}

/**
 * The command to save: every text still showing exactly the translation of a stored English text goes back as that
 * English text, so saving without touching it keeps the template readable in every family member's language. A text
 * the person changed is saved as typed.
 */
export function restoreStoredTexts(
  command: ReportRequestCommand,
  stored: ReportRequestCommand,
  translate: StoredTextTranslateFn
): ReportRequestCommand {
  const originals = new Map<string, string>();
  mapStoredTexts(stored, (text) => {
    const shown = translate(text);
    if (shown !== text) {
      originals.set(shown, text);
    }
    return text;
  });
  return mapStoredTexts(command, (text) => originals.get(text) ?? text);
}
