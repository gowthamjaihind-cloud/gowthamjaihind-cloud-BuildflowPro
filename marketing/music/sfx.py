#!/usr/bin/env python3
"""
Sound effects for the kinetic cut's music-only version, placed on the picture.

The narrated version needs no effects: a voice is already telling the viewer
where to look. Without one, the picture's own events have to be HEARD to land
with the same weight, so each gets a sound, at the frame it happens:

  bell    the spotlight lands on an element, or glides to the next one
  rise    the brand mark's three bars rising -- one note per bar, D F A, the
          tonic chord of the score, so the logo builds the key it resolves to
  swish   the wordmark wiping in beside the mark
  pop     each Procurement chip arriving
  boom    a dolly zoom into or out of the title cards

The transition whooshes are not here: the score already lands one on every
scene boundary, in both versions.

Everything is synthesised, like score.py -- no samples, so no licence -- and
pitched in the score's D minor. Effects that fight the music's key are the
fastest way to make a soundtrack sound assembled rather than written.

  python3 sfx.py out.wav <seconds> <events.json>

where events.json is a list of {"t": seconds, "kind": "...", "note": "A5"?}.
films/kinetic.mjs writes it from film.json, so a retimed scene moves its sounds.
"""
import json
import sys

import numpy as np

import wave

from score import SR, Track, high_pass, hz, kick, low_pass, pluck, reverb


def bell(freq, seconds=1.4, gain=1.0):
    """A soft struck bell: a pluck an octave up, with a slow, quiet shimmer."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    body = pluck(freq, seconds, 1.0)
    shimmer = np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-3.5 * t) * 0.05
    return (body + shimmer) * gain


def pop(seconds=0.09, gain=1.0):
    """A bubble: a sine that sweeps up fast. Reads as 'something appeared'."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = 380 + 900 * (t / seconds) ** 0.6
    out = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-28 * t)
    return out * gain * 0.35


def swish(seconds=0.42, gain=1.0, seed=9):
    """Filtered noise that brightens and fades: the sound of a wipe."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    u = t / seconds
    body = (1 - u) * low_pass(noise, 1800) + u * high_pass(noise, 3500)
    env = np.sin(np.pi * np.minimum(u * 1.4, 1.0)) * np.exp(-2.2 * u)
    return body * env * gain * 0.10


def boom(gain=1.0):
    """A soft low impact under a dolly zoom -- the kick's sweep, slower."""
    return kick(0.7, 1.0) * gain * 0.8


def write_raw(path, mono):
    """
    16-bit stereo at the level it was rendered -- deliberately NOT through
    score.write_wav, which peak-normalises. The effects' level against the music
    is set in the mix; normalising each render to its own loudest sound would
    make that level depend on which effects a given cut happens to contain.
    """
    data = np.repeat(np.clip(mono, -1, 1), 2)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((data * 32767).astype("<i2").tobytes())


def render(total, events):
    t = Track(total)
    for e in events:
        at = float(e["t"])
        kind = e["kind"]
        if kind == "bell":
            # 0.95, up from 0.55: measured against the score in the 150 ms
            # after each one, bells sat at a median -1.6 dB and down to -9.1
            # in the drum bars -- the spotlight's sound vanishing exactly where
            # the music is busiest.
            t.add(at, bell(hz(e.get("note", "A5"))), 0.95)
        elif kind == "rise":
            # 1.1, up from 0.7: the closing card's build sat at -6.9 dB under
            # the score's lift into the finale, so the logo built in silence.
            t.add(at, pluck(hz(e["note"]), 0.9, 1.0), 1.1)
        elif kind == "swish":
            t.add(at, swish(), 1.0)
        elif kind == "pop":
            t.add(at, pop(), 1.6)
        elif kind == "boom":
            t.add(at, boom(), 0.7)
        else:
            raise SystemExit(f"unknown effect {kind!r}")
    # The same room the score is in, so the effects sit IN the music rather
    # than on top of it -- but drier, so they stay crisp.
    return reverb(t.out(total), mix=0.18)


def main():
    if len(sys.argv) != 4:
        print("usage: sfx.py <out.wav> <seconds> <events.json>", file=sys.stderr)
        return 1
    out, seconds, path = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    events = json.load(open(path))
    audio = high_pass(render(seconds, events), 45)
    write_raw(out, audio)
    print(f"sfx: {len(events)} effects over {seconds:.1f}s -> {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
