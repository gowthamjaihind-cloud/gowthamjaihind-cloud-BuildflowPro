#!/usr/bin/env python3
"""
Audit how the voice will say a script, before rendering ninety seconds of it.

I cannot listen to the output in this environment, which sounds like a reason to
just hope -- but Piper exposes the phoneme sequence it will actually synthesise,
so pronunciation is checkable rather than a matter of faith. This prints the IPA
for every distinct word in a script and flags the ones worth a human glance:
product names, Indian-English money words, anything with digits.

It has already earned its place. "Madurai" comes out /mˈædʒuːɹˌaɪ/ -- MAD-joo-rye
-- so the word is out of both scripts. "Sitetru" is right on its own
(/sˈaɪttɹuː/, SITE-troo), which is the kind of thing you would not think to
check and would not want to discover in a render.

One caveat to read the output with: each word is phonemised ON ITS OWN, so
function words look stressed in a way they will not be in the line -- "a" shows
as /ˈeɪ/ here and reduces to a schwa in context. Judge content words from this
list; judge a whole phrase by passing the phrase.

  python3 marketing/voice/pronounce.py marketing/films/launch.script.mjs
"""
import json
import re
import subprocess
import sys
from pathlib import Path

from piper import PiperVoice

MODEL = Path("marketing/voice/model/en_US-joe-medium.onnx")

# Words whose reading carries the brand or a number, so a wrong one is not a
# cosmetic problem. Checked explicitly even when they read correctly today,
# because the espeak dictionary is a moving target across versions.
WATCH = re.compile(
    r"^(sitetru|telegram|whatsapp|gst|lakh|lakhs|crore|crores|rupee|rupees|"
    r"wbs|boq|grn|madurai|razorpay|[0-9].*)$",
    re.I,
)


def lines_of(script: Path) -> list[str]:
    """Pull the vo/say strings out of a script module, via node."""
    out = subprocess.run(
        ["node", "-e", f"""
        import({json.dumps(str(script.resolve()))}).then((m) => {{
          const s = m.default ?? Object.values(m)[0];
          const beats = s.beats ?? s;
          process.stdout.write(JSON.stringify(beats.map((b) => b.vo ?? b.say).filter(Boolean)));
        }});
        """],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: pronounce.py <script.mjs>", file=sys.stderr)
        return 1
    script = Path(sys.argv[1])
    if not MODEL.exists():
        print(f"voice model missing: {MODEL}\nrun: bash marketing/voice/fetch-voice.sh", file=sys.stderr)
        return 2

    voice = PiperVoice.load(str(MODEL), config_path=str(MODEL.with_suffix(".onnx.json")))
    lines = lines_of(script)

    seen: dict[str, str] = {}
    for line in lines:
        for raw in re.findall(r"[A-Za-z0-9'’.]+", line):
            word = raw.strip(".'’")
            if not word or word.lower() in seen:
                continue
            # phonemize() returns a list of SENTENCES, not one flat list.
            # Reading only [0] silently drops everything after the first full
            # stop, which is how a first pass here appeared to show that
            # "Sitetru dot com" was missing from the closing line.
            phones = voice.phonemize(word)
            seen[word.lower()] = " ".join("".join(p) for p in phones) if phones else "?"

    flagged = {w: p for w, p in seen.items() if WATCH.match(w)}
    print(f"{script.name}: {len(lines)} lines, {len(seen)} distinct words\n")
    print("WORTH A LOOK — product names, money words, digits:")
    for w in sorted(flagged):
        print(f"  {w:<14} /{flagged[w]}/")
    print(f"\nEVERYTHING ELSE ({len(seen) - len(flagged)} words):")
    rest = sorted(w for w in seen if w not in flagged)
    for i in range(0, len(rest), 4):
        print("  " + "".join(f"{w:<13}/{seen[w]}/".ljust(34) for w in rest[i : i + 4]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
