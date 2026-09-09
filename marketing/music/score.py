#!/usr/bin/env python3
"""
The score, synthesized from nothing.

Both films need music, and music is the one asset you cannot quietly borrow:
every library track carries a licence, and a licence is exactly the kind of
thing that surfaces two years later when a video is doing well. So this file
composes and renders the cues instead. There is no sample, no loop, no library
and no licence -- the audio is generated from oscillators and noise, and what
you hear was written here.

Two cues, deliberately different jobs:

  launch      D minor, 84 BPM. It has to carry a ninety-second argument and
              arrive somewhere. Sparse pulse, pad, then an arpeggio that keeps
              the pace up under the middle of the film, percussion for the
              build, and a resolve to F major at the end -- the same movement
              the script makes, from "this is hard" to "here it is".

  walkthrough A minor, 72 BPM, no percussion, almost no movement. Its whole
              job is to stop the room sounding dead under a voice that talks
              for three minutes. If you notice it, it is too loud.

Everything downstream is ducked under the voice at mix time, so these are
written with headroom and without anything busy in the 300 Hz - 3 kHz band
where the narration lives.

  python3 score.py launch out.wav 92.5
"""
import math
import sys
import wave

import numpy as np
from scipy.fft import next_fast_len  # noqa: F401  (pulled in by fftconvolve)
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000

# ---------------------------------------------------------------- pitch ----
A4 = 440.0
NAMES = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6,
         "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def hz(note: str) -> float:
    """'A3' -> 220.0. Octave 4 holds middle C."""
    name, octave = note[:-1], int(note[-1])
    semitones = NAMES[name] + 12 * (octave - 4) - 9
    return A4 * (2 ** (semitones / 12))


# ------------------------------------------------------------ envelopes ----
def adsr(n, attack, decay, sustain, release):
    """Sample-accurate ADSR, clamped so a short note cannot overrun itself."""
    a = min(int(attack * SR), n)
    d = min(int(decay * SR), max(n - a, 0))
    r = min(int(release * SR), max(n - a - d, 0))
    s = max(n - a - d - r, 0)
    return np.concatenate([
        np.linspace(0, 1, a, endpoint=False),
        np.linspace(1, sustain, d, endpoint=False),
        np.full(s, sustain),
        np.linspace(sustain, 0, r),
    ])[:n]


# ---------------------------------------------------------- instruments ----
def pluck(freq, seconds, gain=1.0):
    """
    A struck string. Three partials with a little inharmonicity, so it reads as
    something hit rather than a sine beeping; the higher partials decay faster,
    which is what makes a piano sound like a piano.
    """
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, (mult, level, decay) in enumerate([(1, 1.0, 3.2), (2.01, 0.42, 5.2),
                                              (3.02, 0.18, 7.4), (4.98, 0.07, 9.0)]):
        out += level * np.sin(2 * np.pi * freq * mult * t) * np.exp(-decay * t)
    out *= adsr(n, 0.004, 0.05, 0.75, max(seconds - 0.06, 0.01))
    return out * gain * 0.28


def pad(freq, seconds, gain=1.0, detune=0.004):
    """
    Seven detuned saws through a gentle lowpass -- the warm bed under
    everything. Detuning is what stops a stack of oscillators sounding like one
    loud oscillator.
    """
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for i in range(7):
        f = freq * (1 + detune * (i - 3) / 3)
        phase = (f * t + i * 0.13) % 1.0
        out += (2 * phase - 1) / 7          # naive saw, softened below
    out = low_pass(out, 1400, order=4)
    # A slow tremolo keeps a long chord from sounding like a held organ key.
    out *= 1 + 0.05 * np.sin(2 * np.pi * 0.23 * t)
    out *= adsr(n, min(0.9, seconds * 0.35), 0.3, 0.85, min(1.2, seconds * 0.4))
    return out * gain * 0.14


def sub(freq, seconds, gain=1.0):
    """Sine bass with a touch of second harmonic so it survives a phone."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * freq * t) + 0.22 * np.sin(2 * np.pi * 2 * freq * t)
    out *= adsr(n, 0.02, 0.15, 0.8, min(0.5, seconds * 0.5))
    return out * gain * 0.30


def kick(seconds=0.42, gain=1.0):
    """Pitch-dropping sine: the oldest trick, and still the one that works."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = 110 * np.exp(-22 * t) + 42
    out = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-7 * t)
    return out * gain * 0.55


def hat(seconds=0.06, gain=1.0, seed=0):
    """
    Filtered noise, short. Adds pace without adding notes.

    Band-limited on BOTH sides, which the first version was not: open above
    6.5 kHz it put 45% of the whole cue's energy above 3.4 kHz -- audibly hissy
    on its own, and worse than that in the mix, because it sits exactly where a
    voice's sibilance lives and the two turn to mush. A real hat is a band, not
    a shelf.
    """
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    out = rng.standard_normal(n) * np.exp(-52 * np.arange(n) / SR)
    out = high_pass(out, 5200)
    out = low_pass(out, 11000)
    return out * gain * 0.035


def swell(seconds, gain=1.0, seed=1):
    """A noise riser. Used once, into the title."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = rng.standard_normal(n)
    out = high_pass(out, 700)
    out *= (t / max(t[-1], 1e-9)) ** 2.4
    return out * gain * 0.16


# ------------------------------------------------------------- filtering ----
# These are real Butterworth sections via scipy, after a hand-rolled attempt
# went wrong in a way worth recording: the "fast" one-pole was written as a
# cumulative sum of x[n]/a**n, which is algebraically the same recursion and
# numerically useless -- a**n underflows to zero within a few thousand samples,
# 1/a**n overflows, and the filter silently returns NaN that gets zeroed on the
# way out. It rendered, and it rendered nothing. Second-order sections are
# stable, faster than a Python loop, and actually the filter they claim to be.
def low_pass(x, cutoff, order=2):
    sos = butter(order, min(cutoff / (SR / 2), 0.99), btype="low", output="sos")
    return sosfilt(sos, x)


def high_pass(x, cutoff, order=2):
    sos = butter(order, min(cutoff / (SR / 2), 0.99), btype="high", output="sos")
    return sosfilt(sos, x)


def reverb(x, seconds=2.4, mix=0.28, seed=7):
    """
    Convolution with a synthesized impulse: exponentially decaying noise, rolled
    off at the top the way a real room is, with a few milliseconds of pre-delay
    so the direct sound arrives first. This is the difference between the cue
    sounding like a synth patch and sounding like it was played somewhere.
    """
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-4.2 * np.arange(n) / SR)
    ir = low_pass(ir, 3200)
    ir[: int(0.012 * SR)] = 0
    ir /= np.abs(ir).sum() / 40
    wet = fftconvolve(x, ir)[: len(x)]
    return (1 - mix) * x + mix * wet


# ------------------------------------------------------------- sequencer ----
class Track:
    def __init__(self, seconds):
        self.buf = np.zeros(int(seconds * SR) + SR)

    def add(self, at, audio, gain=1.0):
        i = int(at * SR)
        j = min(i + len(audio), len(self.buf))
        if j > i:
            self.buf[i:j] += audio[: j - i] * gain
        return self

    def out(self, seconds):
        return self.buf[: int(seconds * SR)]


def chord(track, at, notes, seconds, voice, gain=1.0):
    for note in notes:
        track.add(at, voice(hz(note), seconds), gain)


# ----------------------------------------------------------------- cues ----
def arc(position):
    """
    The cue's dynamic shape, 0..1 across the film, as a multiplier.

    The first version of this had none, and it showed: energy measured in eight
    blocks came out 0.067 then 0.099 flat to the end. A build that does not
    build is just a loop, and under a script that goes from a question to an
    answer it actively works against the picture. This is the curve that fixes
    it -- held back under the opening, rising through the middle where the film
    makes its case, pulling back for the last line so the voice has the frame,
    and opening up on the resolve.
    """
    if position < 0.10:
        return 0.34                       # the question: almost nothing
    if position < 0.32:
        return 0.34 + (position - 0.10) / 0.22 * 0.36
    if position < 0.72:
        return 0.70 + (position - 0.32) / 0.40 * 0.30
    if position < 0.86:
        return 1.00 - (position - 0.72) / 0.14 * 0.55   # make room for the line
    return 0.45 + (position - 0.86) / 0.14 * 0.55       # and arrive


def launch(total):
    """
    D minor, 84 BPM, resolving to F major.

    The shape is the script's shape. It opens on almost nothing -- one low note
    and a room -- because the film opens on a question. The arpeggio arrives
    when the product does. Percussion builds under the middle, where the film is
    making its case. Everything pulls back before the last line so the voice has
    the frame to itself, then the resolve lands on the logo.
    """
    bpm = 84
    beat = 60 / bpm
    bar = 4 * beat                                   # 2.857s
    t = Track(total)

    # i - VI - III - VII, the progression that sounds like resolve without
    # actually resolving, until the last bars of the film, where it does.
    progression = [
        (["D3", "F3", "A3"], "D2"),
        (["A#2", "D3", "F3"], "A#1"),
        (["F3", "A3", "C4"], "F2"),
        (["C3", "E3", "G3"], "C2"),
    ]
    n_bars = int(total / bar) + 1

    for b in range(n_bars):
        at = b * bar
        if at > total:
            break
        g = arc(at / total)
        notes, bass = progression[b % 4]

        chord(t, at, notes, bar * 1.02, pad, g)
        t.add(at, sub(hz(bass), bar * 0.92), g * 0.9)

        # Arpeggio once the film is past its opening question: eighth notes
        # across the chord, the element that gives the middle its pace.
        if g > 0.55:
            arp = notes + [notes[1]]
            for i in range(8):
                if b % 4 == 3 and i > 5:
                    continue                          # breathe into the turnaround
                t.add(at + i * beat / 2,
                      pluck(hz(arp[i % len(arp)]) * (2 if i % 4 == 3 else 1), beat * 0.9),
                      g * 0.55)

        # Percussion only where the arc is open. It is what makes a build feel
        # like a build, and what makes an opening feel impatient if used early.
        if g > 0.80:
            t.add(at, kick(), g * 0.9)
            t.add(at + 2 * beat, kick(), g * 0.75)
            for i in range(8):
                t.add(at + i * beat / 2, hat(seed=b * 8 + i), g * (0.5 if i % 2 else 0.9))

    # A riser into the final statement, and the resolve under it.
    resolve_at = max(total - bar * 2, 0)
    t.add(max(resolve_at - 1.6, 0), swell(1.6), 0.7)
    chord(t, resolve_at, ["F3", "A3", "C4", "F4"], bar * 2, pad, 1.0)
    t.add(resolve_at, sub(hz("F2"), bar * 2), 1.0)
    for i, note in enumerate(["F4", "A4", "C5", "F5"]):
        t.add(resolve_at + i * beat * 0.5, pluck(hz(note), beat * 3), 0.5)

    return t.out(total)


def walkthrough(total):
    """
    A minor, 72 BPM, no drums.

    A three-minute explainer needs a floor, not a track. This is two chords
    breathing against each other with a note falling through them every couple
    of bars -- enough that the room is alive, little enough that a listener
    concentrating on the narration never has to push it aside.
    """
    bpm = 72
    beat = 60 / bpm
    bar = 4 * beat
    t = Track(total)
    progression = [
        (["A3", "C4", "E4"], "A2"),
        (["F3", "A3", "C4"], "F2"),
        (["C4", "E4", "G4"], "C3"),
        (["G3", "B3", "D4"], "G2"),
    ]
    n_bars = int(total / bar) + 1
    for b in range(n_bars):
        at = b * bar
        if at > total:
            break
        notes, bass = progression[b % 4]
        chord(t, at, notes, bar * 1.05, pad, 0.9)
        # The sub is held well back here. At 0.65 this cue measured 56% of its
        # energy below 200 Hz, which under three minutes of narration is not
        # warmth, it is mud -- and the voice chain high-passes at 85 Hz, so the
        # two do not even overlap usefully.
        t.add(at, sub(hz(bass), bar * 0.9), 0.34)
        # One falling note every other bar. Any more and it becomes a melody,
        # and a melody competes with speech.
        if b % 2 == 0:
            t.add(at + beat * 2, pluck(hz(notes[2]) * 2, beat * 2.5), 0.30)
        if b % 4 == 1:
            t.add(at + beat * 3, pluck(hz(notes[1]) * 2, beat * 2.0), 0.22)
    return t.out(total)


CUES = {"launch": launch, "walkthrough": walkthrough}


def write_wav(path, mono):
    """16-bit stereo, with a small spread so it is not a point source."""
    peak = np.abs(mono).max()
    if peak > 0:
        mono = mono / peak * 0.72
    # Haas-style widening: a few milliseconds of delay on one side.
    delay = int(0.011 * SR)
    left = mono
    right = np.concatenate([np.zeros(delay), mono[:-delay]]) if delay else mono
    inter = np.empty(len(mono) * 2)
    inter[0::2] = left
    inter[1::2] = right
    data = (np.clip(inter, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def main():
    if len(sys.argv) != 4:
        print("usage: score.py <launch|walkthrough> <out.wav> <seconds>", file=sys.stderr)
        return 1
    cue, out, seconds = sys.argv[1], sys.argv[2], float(sys.argv[3])
    if cue not in CUES:
        print(f"unknown cue {cue!r}; have {', '.join(CUES)}", file=sys.stderr)
        return 1
    audio = CUES[cue](seconds)
    audio = reverb(audio, mix=0.30 if cue == "launch" else 0.34)
    # Nothing in either cue needs to be below 45 Hz; leaving it there only eats
    # headroom that the limiter then takes back out of the music.
    audio = high_pass(audio, 45)
    write_wav(out, audio)
    print(f"{cue}: {seconds:.1f}s -> {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
