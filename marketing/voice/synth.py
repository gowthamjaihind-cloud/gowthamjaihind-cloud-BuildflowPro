#!/usr/bin/env python3
"""
Speak a script, offline.

Reads a JSON script on stdin, writes one WAV per line plus a manifest of the
durations that actually came out. Nothing downstream is allowed to guess how
long a line takes -- the film's timeline is built from these numbers, so a
rewrite retimes the picture instead of drifting out of sync with it.

The voice is Piper (VITS, neural) with the CC0 en_US-joe-medium model. It runs
entirely on this machine: no hosted TTS, no per-render API call, nothing about
the product's copy leaving the box. `fetch-voice.sh` gets the model.

Piper normally ships a sidecar JSON beside each model with the phoneme table in
it. The CC0 package on npm carries only the weights, so the config is rebuilt
here from Piper's own DEFAULT_PHONEME_ID_MAP -- the same table every espeak
Piper voice uses, which is why this works rather than being a lucky guess.

  echo '{"outDir":"...","lines":[{"id":"a","text":"..."}]}' | python3 synth.py
"""
import json
import sys
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig
from piper.phoneme_ids import DEFAULT_PHONEME_ID_MAP

# Read at a hair under natural pace. Above ~1.05 the model starts to smear
# consonants; below ~0.95 it sounds like it is reading a form.
DEFAULT_LENGTH = 1.0
# noise_scale is expressiveness and noise_w is timing jitter. Piper's defaults
# (0.667 / 0.8) are tuned for assistants -- a shade lower reads as composed
# rather than chatty, which is what a launch film wants.
NOISE = 0.60
NOISE_W = 0.72


def build_config(model: Path) -> Path:
    """Write the sidecar Piper expects, if the model came without one."""
    cfg_path = model.with_suffix(".onnx.json")
    if cfg_path.exists():
        return cfg_path
    cfg = {
        "audio": {"sample_rate": 22050, "quality": "medium"},
        "espeak": {"voice": "en-us"},
        "language": {"code": "en_US", "family": "en", "region": "US"},
        "inference": {
            "noise_scale": 0.667,
            "length_scale": 1.0,
            "noise_w": 0.8,
        },
        "phoneme_type": "espeak",
        "phoneme_id_map": {k: list(v) for k, v in DEFAULT_PHONEME_ID_MAP.items()},
        "num_symbols": len(DEFAULT_PHONEME_ID_MAP),
        "num_speakers": 1,
        "speaker_id_map": {},
        "piper_version": "1.0.0",
    }
    cfg_path.write_text(json.dumps(cfg))
    return cfg_path


def main() -> int:
    spec = json.load(sys.stdin)
    model = Path(spec.get("model", "marketing/voice/model/en_US-joe-medium.onnx"))
    if not model.exists():
        sys.stderr.write(
            f"voice model missing: {model}\n"
            "run: bash marketing/voice/fetch-voice.sh\n"
        )
        return 2

    out_dir = Path(spec["outDir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    voice = PiperVoice.load(str(model), config_path=str(build_config(model)))

    manifest = []
    for line in spec["lines"]:
        syn = SynthesisConfig(
            length_scale=line.get("length", spec.get("length", DEFAULT_LENGTH)),
            noise_scale=line.get("noise", NOISE),
            noise_w_scale=line.get("noiseW", NOISE_W),
            # Piper's own normalisation drives every line to the same peak,
            # which flattens the read. Level is set once, later, across the
            # whole track.
            normalize_audio=False,
        )
        path = out_dir / f"{line['id']}.wav"
        with wave.open(str(path), "wb") as w:
            voice.synthesize_wav(line["text"], w, syn_config=syn)
        with wave.open(str(path)) as w:
            seconds = w.getnframes() / w.getframerate()
        manifest.append(
            {
                "id": line["id"],
                "text": line["text"],
                "file": str(path),
                "seconds": round(seconds, 3),
                "words": len(line["text"].split()),
            }
        )
        sys.stderr.write(f"  {line['id']:<14} {seconds:6.2f}s  {line['text'][:58]}\n")

    total = sum(m["seconds"] for m in manifest)
    sys.stderr.write(f"  {'total':<14} {total:6.2f}s over {len(manifest)} lines\n")
    print(json.dumps({"lines": manifest, "seconds": round(total, 3)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
