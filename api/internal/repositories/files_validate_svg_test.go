package repositories

import "testing"

func TestValidateFileTypeRejectsSvg(t *testing.T) {
	svg := []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`)

	if _, err := NewFileRepository(nil).ValidateFileType(svg); err == nil {
		t.Fatal("expected an SVG upload to be rejected")
	}
}

func TestValidateFileTypeStillAcceptsPng(t *testing.T) {
	png := []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 'I', 'H', 'D', 'R'}

	if _, err := NewFileRepository(nil).ValidateFileType(png); err != nil {
		t.Fatalf("expected a PNG to be accepted: %v", err)
	}
}
