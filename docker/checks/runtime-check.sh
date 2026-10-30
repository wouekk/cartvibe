#!/bin/sh
# Build-time proof that the runtime image can do what the API shells out to or links against. It runs as a Dockerfile
# step, so a package that is missing (typically one that only arrives as "Recommends") fails the build, not the NAS.
# Every check runs even after a failure, so one build lists everything that is missing.
#
# Needs /tmp/checks/tiny.heic (made by the "fixtures" stage of the Dockerfile).
set -u

failed=0
fail() {
  echo "CHECK FAILED: $1" >&2
  failed=1
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work" || exit 1

# The API's shared libraries.
if ldd /app/cartvibe-api/api | grep "not found"; then
  fail "the API links a library this image does not install"
fi

# HEIC: the coder is registered, and a real file decodes (the file is made by a different image, with an encoder).
magick -list format | grep -qi heic || fail "ImageMagick has no HEIC coder"
magick /tmp/checks/tiny.heic heic.png 2>heic.err || { cat heic.err >&2; fail "a HEIC file does not decode"; }
[ "$(magick identify -format %w heic.png 2>/dev/null)" = "16" ] || fail "the decoded HEIC has the wrong size"

# Text through ImageMagick's standard Helvetica (ghostscript fonts), into a PDF, back to pixels through ghostscript,
# and read by Tesseract: the path of a PDF receipt, with fonts, ghostscript and OCR in one chain.
gs --version >/dev/null || fail "ghostscript is missing"
magick -size 700x160 xc:white -font Helvetica -pointsize 90 -fill black -draw "text 20,115 'RECEIPT'" text.pdf 2>text.err \
  || { cat text.err >&2; fail "ImageMagick cannot draw text and write a PDF"; }
magick -density 150 text.pdf text.png 2>pdf.err || { cat pdf.err >&2; fail "a PDF does not convert to an image"; }
tesseract text.png ocr >/dev/null 2>&1 || fail "Tesseract cannot read an image"
grep -qi receipt ocr.txt 2>/dev/null || fail "Tesseract did not read the word drawn into the PDF"
tesseract --list-langs 2>&1 | grep -qx eng || fail "Tesseract has no English data"

# A PDF with no text (the original check) and the policy: vector and script formats stay refused.
magick -size 40x40 xc:white blank.pdf && magick blank.pdf blank.jpg || fail "a blank PDF does not convert"
if magick -size 40x40 xc:white check.eps 2>/dev/null; then
  fail "ImageMagick policy.xml allows EPS"
fi

# Chromium renders report HTML to a PDF (no sandbox, as the API runs it by default) and ghostscript finds the text in it.
chromium --version >/dev/null || fail "Chromium is missing"
cat > page.html <<'HTML'
<!doctype html><html><body style="font-family: Arial, Helvetica, sans-serif"><h1>Monthly report</h1><p id="p">Groceries 42</p><p>Zażółć gęślą jaźń 5 € 7 zł</p></body></html>
HTML
chromium --headless --no-sandbox --disable-gpu --user-data-dir="$work/profile" --print-to-pdf="$work/page.pdf" "file://$work/page.html" >chromium.log 2>&1 \
  || { tail -20 chromium.log >&2; fail "Chromium cannot print a page to PDF"; }
gs -q -dNOPAUSE -dBATCH -sDEVICE=txtwrite -sOutputFile=- page.pdf 2>/dev/null | grep -q "Monthly report" \
  || fail "the PDF Chromium printed has no readable text"
gs -q -dNOPAUSE -dBATCH -sDEVICE=txtwrite -sOutputFile=- page.pdf 2>/dev/null | grep -q "Zażółć gęślą jaźń 5 € 7 zł" \
  || fail "the PDF lost Polish letters or currency signs (a font is missing)"
chromium --headless --no-sandbox --disable-gpu --user-data-dir="$work/profile" --dump-dom "file://$work/page.html" 2>/dev/null | grep -q "Groceries 42" \
  || fail "Chromium cannot render a page"

# Reports ask for Arial/Helvetica: they must land on a real font (Liberation), not the engine's fallback.
echo "fonts: $(fc-list : family | sort -u | tr '\n' ';')"
fc-match Arial family | grep -qi liberation || fail "Arial does not resolve to Liberation Sans"

# What the Dockerfile needs for hardening and entry.
setpriv --version >/dev/null || fail "setpriv is missing"
nginx -v >/dev/null 2>&1 || fail "nginx is missing"

if [ "$failed" -ne 0 ]; then
  exit 1
fi
echo "runtime checks passed"
