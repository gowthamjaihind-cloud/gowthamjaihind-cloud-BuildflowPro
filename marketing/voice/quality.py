#!/usr/bin/env python3
"""
Two numbers for "does this voice sound robotic", measured rather than heard.

The README has quoted these since Piper was replaced by Kokoro, but the code
that produced them was never committed, so nobody could re-run the comparison.
This is that code, written down.

  octave-jumps  How often an autocorrelation pitch track moves more than six
                semitones between adjacent 10 ms voiced frames. A real voice
                glides; a tracker that jumps means the waveform is not cleanly
                periodic -- the warble people hear as "AI".
  HNR           Harmonics-to-noise ratio from the normalised autocorrelation
                peak, averaged over voiced frames. 0 dB is as much noise energy
                as harmonic energy, which is what "robotic" actually sounds like.

Neither number can say whether a voice has the RIGHT ACCENT. That is a judgement
for a listener, and this script makes no attempt at it.

  python3 quality.py a.wav b.wav ...
"""
import sys
import wave

import numpy as np


def load(path):
    with wave.open(path) as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768
    if ch > 1:
        x = x[0::ch]
    return x, sr


def measure(x, sr, fmin=70.0, fmax=400.0):
    hop = int(0.010 * sr)
    win = int(0.040 * sr)
    lo, hi = int(sr / fmax), int(sr / fmin)
    pitches, hnrs = [], []
    for start in range(0, len(x) - win, hop):
        f = x[start:start + win]
        f = f - f.mean()
        energy = (f * f).sum()
        if energy < 1e-4:
            pitches.append(None)
            continue
        ac = np.correlate(f, f, "full")[win - 1:]
        ac = ac / ac[0]
        lag = lo + int(np.argmax(ac[lo:hi]))
        r = float(ac[lag])
        if r < 0.45:                       # unvoiced
            pitches.append(None)
            continue
        pitches.append(sr / lag)
        r = min(r, 0.9999)
        hnrs.append(10 * np.log10(r / (1 - r)))
    pairs = [(a, b) for a, b in zip(pitches, pitches[1:]) if a and b]
    jumps = sum(1 for a, b in pairs if abs(12 * np.log2(b / a)) > 6)
    voiced = [p for p in pitches if p]
    return {
        "octave_jumps_pct": 100.0 * jumps / max(len(pairs), 1),
        "hnr_db": float(np.mean(hnrs)) if hnrs else float("nan"),
        "median_f0": float(np.median(voiced)) if voiced else float("nan"),
        "voiced_pct": 100.0 * len(voiced) / max(len(pitches), 1),
    }


def main():
    for path in sys.argv[1:]:
        m = measure(*load(path))
        print(
            f"{path.rsplit('/', 1)[-1]:<34} octave-jumps {m['octave_jumps_pct']:5.1f}%   "
            f"HNR {m['hnr_db']:5.2f} dB   f0 {m['median_f0']:5.0f} Hz"
        )


if __name__ == "__main__":
    main()
