#!/usr/bin/env bash
# Runs a go command on a machine without ImageMagick 7 or Tesseract (e.g. the Windows PC), by swapping
# their cgo bindings for empty stubs. Good for `vet` and for tests that do not touch images or OCR;
# those tests fail here and must be judged in CI. Never use it to build the server.
#
#   ./scripts/go-without-cgo.sh vet ./...
#   ./scripts/go-without-cgo.sh test ./internal/services/ -run Trip
#
# Run from api/. Expected local failures: PDF/HEIC/image tests (stubbed ImageMagick), HTML-to-PDF
# (needs Chromium: run ./scripts/test-pdf.sh after ./scripts/install-test-chromium.sh), and a few
# temp-sweep tests that assume Unix paths and permissions.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <go subcommand> [args...]" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/imagick/imagick" "$work/gosseract"

printf 'module gopkg.in/gographics/imagick.v3\n\ngo 1.20\n' > "$work/imagick/go.mod"
cat > "$work/imagick/imagick/stub.go" <<'EOF'
package imagick

// Stub of the cgo binding, for type-checking only. Add methods here as the code starts using them.
type MagickWand struct{}
type ImageType int
type AlphaChannelType int
type FilterType int
type ColorspaceType int
type PixelWand struct{}

const IMAGE_TYPE_BILEVEL ImageType = 1
const ALPHA_CHANNEL_REMOVE AlphaChannelType = 1
const FILTER_LANCZOS FilterType = 1
const COLORSPACE_SRGB ColorspaceType = 1

func NewPixelWand() *PixelWand       { return &PixelWand{} }
func (pw *PixelWand) Destroy()         {}
func (pw *PixelWand) SetColor(c string) bool { return true }

func Initialize()                {}
func Terminate()                 {}
func NewMagickWand() *MagickWand { return &MagickWand{} }

func (mw *MagickWand) AddImage(wand *MagickWand) error                      { return nil }
func (mw *MagickWand) AutoOrientImage() error                              { return nil }
func (mw *MagickWand) ResizeImage(cols, rows uint, filter FilterType) error { return nil }
func (mw *MagickWand) SetImageBackgroundColor(pw *PixelWand) error         { return nil }
func (mw *MagickWand) StripImage() error                                    { return nil }
func (mw *MagickWand) TransformImageColorspace(cs ColorspaceType) error     { return nil }
func (mw *MagickWand) AppendImages(topToBottom bool) *MagickWand            { return mw }
func (mw *MagickWand) BlurImage(radius, sigma float64) error                { return nil }
func (mw *MagickWand) ContrastImage(sharpen bool) error                     { return nil }
func (mw *MagickWand) DeskewImage(threshold float64) error                  { return nil }
func (mw *MagickWand) Destroy()                                             {}
func (mw *MagickWand) EnhanceImage() error                                  { return nil }
func (mw *MagickWand) GetImage() *MagickWand                                { return mw }
func (mw *MagickWand) GetImageBlob() ([]byte, error)                        { return nil, nil }
func (mw *MagickWand) GetImageHeight() uint                                 { return 0 }
func (mw *MagickWand) GetImageWidth() uint                                  { return 0 }
func (mw *MagickWand) GetNumberImages() uint                                { return 0 }
func (mw *MagickWand) ReadImage(filename string) error                      { return nil }
func (mw *MagickWand) ReadImageBlob(blob []byte) error                      { return nil }
func (mw *MagickWand) ResetIterator()                                       {}
func (mw *MagickWand) ScaleImage(cols, rows uint) error                     { return nil }
func (mw *MagickWand) SetCompressionQuality(quality uint) error             { return nil }
func (mw *MagickWand) SetImageAlphaChannel(operation AlphaChannelType) error { return nil }
func (mw *MagickWand) SetImageFormat(format string) error                   { return nil }
func (mw *MagickWand) SetImageType(imgtype ImageType) error                 { return nil }
func (mw *MagickWand) SetIteratorIndex(index int) bool                      { return true }
func (mw *MagickWand) SetResolution(xRes, yRes float64) error               { return nil }
func (mw *MagickWand) SharpenImage(radius, sigma float64) error             { return nil }
func (mw *MagickWand) TrimImage(fuzz float64) error                         { return nil }
func (mw *MagickWand) WriteImage(filename string) error                     { return nil }
EOF

printf 'module github.com/otiai10/gosseract/v2\n\ngo 1.20\n' > "$work/gosseract/go.mod"
cat > "$work/gosseract/stub.go" <<'EOF'
package gosseract

// Stub of the cgo binding, for type-checking only.
type SettableVariable string
type Client struct{}

func NewClient() *Client                                                    { return &Client{} }
func (client *Client) Close() error                                         { return nil }
func (client *Client) SetVariable(key SettableVariable, value string) error { return nil }
func (client *Client) SetImageFromBytes(data []byte) error                  { return nil }
func (client *Client) Text() (string, error)                                { return "", nil }
EOF

# Git Bash's /tmp means nothing to a Windows go.exe; give it a path it can open.
native="$work"
if command -v cygpath >/dev/null 2>&1; then
  native="$(cygpath -m "$work")"
fi

cp go.mod "$work/go.mod"
cp go.sum "$work/go.sum"
cat >> "$work/go.mod" <<EOF

replace gopkg.in/gographics/imagick.v3 => $native/imagick
replace github.com/otiai10/gosseract/v2 => $native/gosseract
EOF

subcommand="$1"
shift
CGO_ENABLED=0 go "$subcommand" -modfile="$native/go.mod" "$@"
