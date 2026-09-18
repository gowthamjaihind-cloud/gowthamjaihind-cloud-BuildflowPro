#!/usr/bin/env python3
"""
The two cues' dynamic shapes, and NOTHING ELSE.

Split out of score.py because these are pure arithmetic and its tests should
not need a scientific Python stack to run. score.py imports numpy and scipy at
module level; the CI runner that deploys this app has neither, so a test that
imported it passed on every pull request and failed only once it reached main
-- the preview workflow does not run `npm test`, the deploy workflow does.

Keeping the curves here means the continuity and shape checks run everywhere,
and only the test that actually renders audio needs the heavy imports.
"""


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


def walk_arc(position, bloom=0.94, ramp=0.02):
    """
    The walkthrough's dynamic shape, 0..1 across the film, as a multiplier.
    `bloom` is where the lift begins and `ramp` is how long it takes, both as
    positions, so the arrival is timed off the voice instead of off a guessed
    fraction of the runtime.

    `launch` has had `arc` from early on; this cue never did, and measuring the
    finished film is what made that impossible to ignore. Short-term loudness in
    twelve blocks came out -13.5, -13.7, -14.0, -13.8, -14.3, -14.2, -14.1,
    -14.1, -14.1, -14.0, -14.3, -14.9: a straight line for two and three quarter
    minutes.

    The end is the part that actually hurt, and averaging in twelve blocks hid
    how much. The last block reads -14.9 because it is thirteen seconds wide and
    mostly contains the closing line. Measured against where the voice really
    stops, the final 3.4 seconds sit at -18.7 LUFS against a CTA at -13.5 --
    the film falls off a 5 LU cliff onto its own end card, at the one moment a
    viewer is most likely to remember.

    Two things had to be true to fix it, and the first attempt had neither.
    The lift has to be timed off the voice rather than off a guessed fraction
    of the runtime: the picture cuts to the end card while the CTA is still
    playing, so a bloom placed by eye at 0.92 fired seven seconds early, under
    the line it was supposed to make room for. And it has to be big, because
    `write_wav` peak-normalises: a tail only 1.18x the body is 1.18x of nothing
    once the whole cue is divided by its own loudest sample. Hence 1.60, with
    `MUSIC_DB` raised to put the body back where it was.

    The middle stays deliberately narrow. `arc` drops to 0.34 and gets away with
    it over 78 seconds of drums; here the bed's whole job is keeping the room
    alive under close explanation, and at 0.34 under a 16 dB duck there would be
    nothing left to hear.
    """
    if position < 0.05:
        return 0.72                       # the first line, unaccompanied-ish
    if position < 0.28:
        return 0.72 + (position - 0.05) / 0.23 * 0.20
    if position < 0.70:
        return 0.92 + (position - 0.28) / 0.42 * 0.08
    if position < bloom:
        # Ease off across the whole closing stretch, however long it runs, so
        # the last lines keep the frame.
        return 1.00 - (position - 0.70) / max(1e-6, bloom - 0.70) * 0.18
    # And come back up to where the body sits. Deliberately NO higher: an
    # earlier version took the tail to 1.60 so the end card would arrive, and
    # since `write_wav` peak-normalises the whole cue, all that did was divide
    # everything else by 1.60 and force `MUSIC_DB` up 4 dB to compensate. The
    # arrival is a LEVEL decision, and it belongs in the mix, where it can be
    # automated against the voice directly instead of smuggled through a
    # composition gain that normalisation then takes back out.
    t = min((position - bloom) / max(1e-6, ramp), 1.0)
    return 0.82 + (t * t * (3 - 2 * t)) * 0.18
