#!/usr/bin/env python3
"""
Speak a script, offline.

Reads a JSON script on stdin, writes one WAV per line plus a manifest of the
durations that actually came out. Nothing downstream is allowed to guess how
long a line takes -- the films' timelines are built from these numbers, so a
rewrite retimes the picture instead of drifting out of sync with it.

THE VOICE is Kokoro-82M (Apache-2.0), a StyleTTS2-derived model, running
entirely on this machine: no hosted TTS, no per-render API call, nothing about
the product's copy leaving the box. `fetch-voice.sh` gets the weights.

It replaced Piper, and the reason was measurable rather than aesthetic. On the
same three lines:

                       octave-jumps    HNR
    piper joe (male)         17.2%    0.63 dB
    kokoro af_bella           0.3%    6.71 dB

"Octave-jumps" is how often an autocorrelation pitch track moves more than six
semitones between adjacent 10 ms frames. A real voice glides; a tracker jumping
means the waveform is not cleanly periodic. HNR is harmonics-to-noise -- Piper's
0.63 dB is as much noise energy as harmonic energy, which is what "robotic"
actually sounds like. Kokoro is roughly ten times cleaner on the first and six
decibels better on the second.

THE PHONEMIZER is still Piper's espeak bridge, which is why that model is still
fetched. It emits exactly the IPA character set Kokoro's vocabulary expects and
it keeps terminal punctuation, which Kokoro uses for phrasing. The espeak-ng CLI
does neither: it injects zero-width joiners into diphthongs (sˈa‍ɪt) and drops
the full stop.

  echo '{"outDir":"...","lines":[{"id":"a","text":"..."}]}' | python3 synth.py
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np
import onnxruntime as ort
from piper import PiperVoice
from piper.phoneme_ids import DEFAULT_PHONEME_ID_MAP

HERE = Path(__file__).resolve().parent
MODEL_DIR = HERE / "model"
SAMPLE_RATE = 24000
STYLE_DIM = 256
# Kokoro indexes its style vector by token count; the table has 510 rows.
MAX_TOKENS = 510

# af_bella: the cleanest of the eleven female voices auditioned -- 0.3%
# octave-jumps and the best HNR of the set -- at a mid register (198 Hz) that
# reads as composed rather than bright. The runners-up, if this ever wants
# changing: bf_alice (British, 217 Hz, brighter), af_aoede (176 Hz, warmer),
# af_kore (153 Hz, lowest). Any name in model/voices works.
DEFAULT_VOICE = "af_bella"

# 1.0 is Kokoro's natural pace. It is genuinely natural here, unlike Piper's,
# so the films no longer stretch it to compensate.
DEFAULT_SPEED = 1.0


def piper_config(model: Path) -> Path:
    """Write the sidecar Piper expects, if the model came without one."""
    cfg_path = model.with_suffix(".onnx.json")
    if cfg_path.exists():
        return cfg_path
    cfg = {
        "audio": {"sample_rate": 22050, "quality": "medium"},
        "espeak": {"voice": "en-us"},
        "language": {"code": "en_US", "family": "en", "region": "US"},
        "inference": {"noise_scale": 0.667, "length_scale": 1.0, "noise_w": 0.8},
        "phoneme_type": "espeak",
        "phoneme_id_map": {k: list(v) for k, v in DEFAULT_PHONEME_ID_MAP.items()},
        "num_symbols": len(DEFAULT_PHONEME_ID_MAP),
        "num_speakers": 1,
        "speaker_id_map": {},
        "piper_version": "1.0.0",
    }
    cfg_path.write_text(json.dumps(cfg))
    return cfg_path


class Voice:
    def __init__(self, voice: str = DEFAULT_VOICE):
        missing = [
            p for p in (MODEL_DIR / "kokoro.onnx", MODEL_DIR / "tokenizer.json",
                        MODEL_DIR / "en_US-joe-medium.onnx")
            if not p.exists()
        ]
        if missing:
            raise SystemExit(
                "voice files missing:\n  " + "\n  ".join(str(p) for p in missing) +
                "\nrun: bash marketing/voice/fetch-voice.sh"
            )
        self.vocab = json.loads((MODEL_DIR / "tokenizer.json").read_text())["model"]["vocab"]
        self.session = ort.InferenceSession(
            str(MODEL_DIR / "kokoro.onnx"), providers=["CPUExecutionProvider"]
        )
        piper_model = MODEL_DIR / "en_US-joe-medium.onnx"
        self.phonemizer = PiperVoice.load(
            str(piper_model), config_path=str(piper_config(piper_model))
        )
        self.set_voice(voice)

    def set_voice(self, voice: str) -> None:
        path = MODEL_DIR / "voices" / f"{voice}.bin"
        if not path.exists():
            have = sorted(p.stem for p in (MODEL_DIR / "voices").glob("*.bin"))
            raise SystemExit(f"no voice {voice!r}; have: {', '.join(have)}")
        self.voice = voice
        self.style = np.fromfile(path, dtype=np.float32).reshape(MAX_TOKENS, STYLE_DIM)

    def phonemes(self, text: str) -> str:
        # phonemize() returns a list of SENTENCES. They must be re-joined with a
        # space: without it the last phoneme of one sentence fuses onto the
        # first of the next (…pˈeɪpɚwˌɜːk.sˈaɪttɹuː…).
        return " ".join("".join(s) for s in self.phonemizer.phonemize(text))

    def say(self, text: str, speed: float = DEFAULT_SPEED) -> np.ndarray:
        ids = [0] + [self.vocab[c] for c in self.phonemes(text) if c in self.vocab] + [0]
        if len(ids) > MAX_TOKENS:
            raise SystemExit(
                f"line is {len(ids)} tokens, over Kokoro's {MAX_TOKENS}: split it.\n  {text[:90]}"
            )
        row = min(max(len(ids) - 2, 0), MAX_TOKENS - 1)
        out = self.session.run(None, {
            "input_ids": np.array([ids], dtype=np.int64),
            "style": self.style[row][None, :],
            "speed": np.array([speed], dtype=np.float32),
        })[0].squeeze()
        return np.asarray(out, dtype=np.float32)


def write_wav(path: Path, audio: np.ndarray) -> float:
    # Trimmed to the speech, then given a fixed head and tail. Kokoro leaves a
    # variable amount of silence at each end, and the mix places lines by their
    # start time -- so a line with 400 ms of leading silence lands late against
    # its own picture no matter how carefully the timeline was built.
    speech = np.where(np.abs(audio) > 0.012)[0]
    if len(speech):
        audio = audio[max(int(speech[0]) - int(0.03 * SAMPLE_RATE), 0):
                      int(speech[-1]) + int(0.10 * SAMPLE_RATE)]
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    return len(audio) / SAMPLE_RATE


def main() -> int:
    spec = json.load(sys.stdin)
    out_dir = Path(spec["outDir"])
    out_dir.mkdir(parents=True, exist_ok=True)

    voice = Voice(spec.get("voice", DEFAULT_VOICE))
    sys.stderr.write(f"  voice: kokoro {voice.voice}\n")

    manifest = []
    for line in spec["lines"]:
        audio = voice.say(line["text"], speed=line.get("speed", spec.get("speed", DEFAULT_SPEED)))
        path = out_dir / f"{line['id']}.wav"
        seconds = write_wav(path, audio)
        manifest.append({
            "id": line["id"],
            "text": line["text"],
            "file": str(path),
            "seconds": round(seconds, 3),
            "words": len(line["text"].split()),
        })
        sys.stderr.write(f"  {line['id']:<14} {seconds:6.2f}s  {line['text'][:56]}\n")

    total = sum(m["seconds"] for m in manifest)
    sys.stderr.write(f"  {'total':<14} {total:6.2f}s over {len(manifest)} lines\n")
    print(json.dumps({"lines": manifest, "seconds": round(total, 3),
                      "voice": f"kokoro {voice.voice}"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
