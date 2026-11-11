package jobs

import (
	"cartvibe/api/internal/models"
	"encoding/json"
	"testing"
)

// A scan that was queued before the update is worked after it: its payload still calls the note a comment and
// may name a status that no longer exists. Both must read as what they became, or the scan would fail.
func TestQuickScanTaskPayloadReadsAJobQueuedBeforeTheUpdate(t *testing.T) {
	var old QuickScanTaskPayload
	err := json.Unmarshal([]byte(`{"GroupId":3,"Status":"NEEDS_ATTENTION","Comment":"for the party","TempPath":"temp/a.jpg"}`), &old)
	if err != nil {
		t.Fatal(err)
	}
	if old.noteText() != "for the party" {
		t.Errorf("note = %q, want the old comment", old.noteText())
	}
	if old.Status != models.OPEN {
		t.Errorf("status = %q, want OPEN", old.Status)
	}

	var current QuickScanTaskPayload
	if err := json.Unmarshal([]byte(`{"Status":"RESOLVED","Note":"new","Comment":"old"}`), &current); err != nil {
		t.Fatal(err)
	}
	if current.noteText() != "new" || current.Status != models.RESOLVED {
		t.Errorf("got note %q, status %q", current.noteText(), current.Status)
	}

	// What is queued today carries the note under its own name.
	queued, err := json.Marshal(QuickScanTaskPayload{Note: "kept"})
	if err != nil {
		t.Fatal(err)
	}
	var back QuickScanTaskPayload
	if err := json.Unmarshal(queued, &back); err != nil || back.noteText() != "kept" {
		t.Errorf("round trip: %q (%v)", back.noteText(), err)
	}
}
