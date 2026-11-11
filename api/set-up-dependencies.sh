#!/usr/bin/env bash
# Installs, on Debian, the programs the API's test suite starts (CI's test-api job runs it):
#
#   - ImageMagick 7 with HEIC, Ghostscript for PDF pages, and Tesseract with the five languages the app ships in:
#     the API runs them as programs (internal/imagetool), so the tests need them on the PATH;
#   - Chromium, for the HTML-to-PDF tests.
#
# Nothing here is needed to compile the API: it has no C code (CGO_ENABLED=0 builds it). The image that ships
# installs its own runtime packages and its own ImageMagick policy (docker/Dockerfile, the runtime stage).
set -euo pipefail

apt-get update -y -qq

# ImageMagick 7 with the HEIC libraries, and Ghostscript, which draws a PDF's pages for it.
apt-get install -y -qq imagemagick-7.q16 libheif1 libde265-0 ghostscript

# Tesseract, the program, with its language data.
apt-get install -y -qq tesseract-ocr tesseract-ocr-eng tesseract-ocr-pol tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa

# The tests must not go on without a HEIC coder: receipts from iPhones are HEIC. (grep reads the whole list: with
# -q it would stop at the first match and fail the pipeline through a broken pipe.)
magick -list format | grep -i heic > /dev/null

# Chromium renders report HTML to PDF through chromedp.
apt-get install -y -qq chromium

# Debian's policy refuses PDF; the tests convert PDF receipts.
policy_file="/etc/ImageMagick-7/policy.xml"
if [ -f "$policy_file" ]; then
  sed -i 's|<policy domain="coder" rights="none" pattern="PDF" />|<policy domain="coder" rights="read\|write" pattern="PDF" />|g' "$policy_file"
fi

# Say what the tests will run with. (No pipes into head: under pipefail a closed pipe would fail the script.)
magick -version
tesseract --version
gs --version
