#!/usr/bin/env bash
# Fetch the neural voice model. ~58 MB, so it is not committed.
#
# en_US-joe-medium, a Piper VITS voice released CC0 (public domain). Piper's own
# models live on Hugging Face, which this sandbox cannot reach; the same weights
# are mirrored on npm, which it can. Either source gives the identical file.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="$here/model"
mkdir -p "$dest"
if [ -f "$dest/en_US-joe-medium.onnx" ]; then
  echo "voice model already present: $dest/en_US-joe-medium.onnx"; exit 0
fi
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
( cd "$tmp" && npm pack vowel-lab-voices-float --silent >/dev/null && tar xzf ./*.tgz )
mv "$tmp/package/float.onnx" "$dest/en_US-joe-medium.onnx"
echo "voice model installed: $dest/en_US-joe-medium.onnx"
