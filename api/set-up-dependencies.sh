#!/usr/bin/env bash
# Installs what the API needs to be compiled on Debian: the cgo bindings link ImageMagick 7 and Tesseract.
#
#   bash set-up-dependencies.sh                     the libraries to build (the api-build stage of docker/Dockerfile)
#   bash set-up-dependencies.sh --with-test-tools   also what the test suite runs (CI's test-api job)
#
# The test tools are Chromium (the HTML-to-PDF tests) and a PDF-enabled ImageMagick policy. They are kept out of the
# image build on purpose: nothing compiles against them, and Chromium is by far the largest download here.
# The image that ships installs its own runtime packages and its own policy (docker/Dockerfile, the runtime stage).
set -euo pipefail

with_test_tools=0
if [ "${1:-}" = "--with-test-tools" ]; then
  with_test_tools=1
fi

apt-get update -y -qq
apt-get install -y -qq build-essential pkg-config

# Tesseract with its English data, and the HEIC libraries ImageMagick links.
apt-get install -y -qq libtesseract-dev libleptonica-dev tesseract-ocr-eng tesseract-ocr-pol tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa libde265-dev libheif-dev

# ImageMagick 7 with HEIC support.
apt-get install -y -qq imagemagick-7.q16 libmagickwand-7.q16-dev

# The build must not go on without a HEIC coder: receipts from iPhones are HEIC. (grep reads the whole list: with
# -q it would stop at the first match and fail the pipeline through a broken pipe.)
magick -list format | grep -i heic > /dev/null

if [ "$with_test_tools" = "1" ]; then
  # Chromium renders report HTML to PDF through chromedp.
  apt-get install -y -qq chromium

  # Debian's policy refuses PDF; the tests convert PDF receipts.
  policy_file="/etc/ImageMagick-7/policy.xml"
  if [ -f "$policy_file" ]; then
    sed -i 's|<policy domain="coder" rights="none" pattern="PDF" />|<policy domain="coder" rights="read\|write" pattern="PDF" />|g' "$policy_file"
  fi
fi
