package models

import "strings"

// MaxReceiptNoteLength is the longest note a person may write on a receipt, in characters (runes). SQLite
// enforces no length, so the commands that take a note check it. It is generous on purpose: a thread of comments
// joined by the data migration has to stay editable.
const MaxReceiptNoteLength = 10000

// NoteEntry is one comment of the thread a receipt had before it had a note: who wrote it (their display name,
// empty when the account is gone) and what they wrote.
type NoteEntry struct {
	Author string
	Text   string
}

// JoinCommentsIntoNote turns a receipt's comments, oldest first, into its one note. A single comment is the note
// as it was written; several become one line each, with the author's name in front when it is known, so the
// thread still reads as who said what. Empty comments are left out.
func JoinCommentsIntoNote(entries []NoteEntry) string {
	kept := make([]NoteEntry, 0, len(entries))
	for _, entry := range entries {
		text := strings.TrimSpace(entry.Text)
		if text != "" {
			kept = append(kept, NoteEntry{Author: strings.TrimSpace(entry.Author), Text: text})
		}
	}

	if len(kept) == 1 {
		return kept[0].Text
	}

	lines := make([]string, 0, len(kept))
	for _, entry := range kept {
		if entry.Author == "" {
			lines = append(lines, entry.Text)
		} else {
			lines = append(lines, entry.Author+": "+entry.Text)
		}
	}
	return strings.Join(lines, "\n")
}
