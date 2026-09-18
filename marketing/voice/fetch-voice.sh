#!/usr/bin/env bash
# Fetch the neural voice. ~117 MB, so it is not committed.
#
# Kokoro-82M (Apache-2.0), a StyleTTS2-derived model, plus its 59 voice
# embeddings. Kokoro's own weights live on Hugging Face, which this sandbox
# cannot reach; the identical files are bundled inside the `expo-kokoro` npm
# package, which it can. Same model, reachable registry.
#
# This replaced Piper (en_US-joe-medium), which was measurably the problem
# rather than a matter of taste: its pitch track broke on 17.2% of voiced
# frames and its harmonics-to-noise ratio was 0.63 dB -- as much noise energy
# as harmonic energy, which is exactly what "robotic" sounds like. Kokoro
# measures 0.3-2.3% and 5-6.7 dB on the same lines.
#
# Piper is still installed and still used, but only as the PHONEMIZER: its
# espeak bridge emits precisely the IPA character set Kokoro's vocabulary
# expects and keeps terminal punctuation, which drives Kokoro's prosody. The
# espeak-ng CLI does neither -- it injects zero-width joiners into diphthongs
# and drops the full stop.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="$here/model"
mkdir -p "$dest"

if [ -f "$dest/kokoro.onnx" ] && [ -f "$dest/tokenizer.json" ] && [ -d "$dest/voices" ]; then
  echo "voice already present: $dest/kokoro.onnx ($(ls "$dest/voices" | wc -l) voices)"
  exit 0
fi

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "fetching kokoro (~89 MB model + 28 MB of voices) ..."
( cd "$tmp" && npm pack expo-kokoro --silent >/dev/null && tar xzf ./*.tgz )
build="$tmp/package/build"
[ -f "$build/kokoro-quantized.onnx" ] || { echo "expo-kokoro layout changed: no kokoro-quantized.onnx" >&2; exit 1; }

mv "$build/kokoro-quantized.onnx" "$dest/kokoro.onnx"
mv "$build/tokenizer.json"        "$dest/tokenizer.json"
rm -rf "$dest/voices"; mv "$build/voices" "$dest/voices"
# The npm package ships a React Native index.ts alongside the embeddings, which
# imports expo-asset. Nothing here uses it, and left in place it lands in the
# root tsconfig's program and fails the repo's typecheck on a module that will
# never be installed. Keep the weights, drop the wrapper.
find "$dest/voices" -type f ! -name "*.bin" -delete
echo "voice installed: $dest/kokoro.onnx, $(ls "$dest/voices" | wc -l) voices"

# Piper supplies the phonemizer, not the voice. Its own model is small and the
# films no longer speak with it, but phonemize() needs a loaded voice.
if [ ! -f "$dest/en_US-joe-medium.onnx" ]; then
  echo "fetching the piper model used only for phonemisation (~58 MB) ..."
  tmp2="$(mktemp -d)"
  ( cd "$tmp2" && npm pack vowel-lab-voices-float --silent >/dev/null && tar xzf ./*.tgz )
  mv "$tmp2/package/float.onnx" "$dest/en_US-joe-medium.onnx"
  rm -rf "$tmp2"
  echo "phonemizer model installed"
fi
