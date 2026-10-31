package cell

import "testing"

func TestParseMode(t *testing.T) {
	cases := []struct {
		raw         string
		want        Mode
		wantErr     bool
		implemented bool
	}{
		{raw: "", want: ModeStandalone, implemented: true},
		{raw: "standalone", want: ModeStandalone, implemented: true},
		{raw: "  Standalone\n", want: ModeStandalone, implemented: true},
		{raw: "worker", want: ModeWorker},
		{raw: "imgproc", want: ModeImgproc},
		{raw: "standalon", wantErr: true},
		{raw: "hosted", wantErr: true},
	}

	for _, tc := range cases {
		got, err := ParseMode(tc.raw)
		if tc.wantErr {
			if err == nil {
				t.Errorf("ParseMode(%q): expected an error, got mode %q", tc.raw, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseMode(%q): unexpected error %v", tc.raw, err)
			continue
		}
		if got != tc.want {
			t.Errorf("ParseMode(%q) = %q, want %q", tc.raw, got, tc.want)
		}
		if got.Implemented() != tc.implemented {
			t.Errorf("Mode %q Implemented() = %v, want %v", got, got.Implemented(), tc.implemented)
		}
	}
}
