package models

import "testing"

func TestJoinCommentsIntoNote(t *testing.T) {
	cases := map[string]struct {
		entries []NoteEntry
		want    string
	}{
		"no comments, no note": {nil, ""},
		// The common case, a Quick Scan comment: the note is what was written, with no name in front.
		"one comment is the note as written": {
			[]NoteEntry{{Author: "Anna", Text: "For the party"}}, "For the party",
		},
		"a thread reads as who said what, oldest first": {
			[]NoteEntry{{Author: "Anna", Text: "For the party"}, {Author: "Piotr", Text: "Split it?"}, {Author: "Anna", Text: "No need"}},
			"Anna: For the party\nPiotr: Split it?\nAnna: No need",
		},
		"a comment whose author is gone keeps its text": {
			[]NoteEntry{{Author: "Anna", Text: "First"}, {Author: "", Text: "Second"}},
			"Anna: First\nSecond",
		},
		"empty comments are left out, and one that is left is the note as written": {
			[]NoteEntry{{Author: "Anna", Text: "   "}, {Author: "Piotr", Text: "  Kept  "}, {Author: "Anna", Text: ""}},
			"Kept",
		},
		"a comment keeps its own line breaks": {
			[]NoteEntry{{Author: "Anna", Text: "Line one\nLine two"}, {Author: "Piotr", Text: "Ok"}},
			"Anna: Line one\nLine two\nPiotr: Ok",
		},
	}

	for name, test := range cases {
		t.Run(name, func(t *testing.T) {
			if got := JoinCommentsIntoNote(test.entries); got != test.want {
				t.Errorf("got %q, want %q", got, test.want)
			}
		})
	}
}

func TestGroupReceiptSettings_IsQuickScanNoteShown(t *testing.T) {
	cases := []struct {
		enabled, hidden, want bool
	}{
		{false, false, false},
		{true, false, true},
		// Hiding the note for the household wins, without changing the Quick Scan switch.
		{true, true, false},
		{false, true, false},
	}
	for _, test := range cases {
		settings := GroupReceiptSettings{QuickScanNoteEnabled: test.enabled, HideNote: test.hidden}
		if got := settings.IsQuickScanNoteShown(); got != test.want {
			t.Errorf("enabled %v, hidden %v: got %v, want %v", test.enabled, test.hidden, got, test.want)
		}
	}
}
