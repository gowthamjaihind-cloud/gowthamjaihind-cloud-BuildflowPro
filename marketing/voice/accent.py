#!/usr/bin/env python3
"""
Indian English, as a respelling of the phonemiser's American IPA.

Kokoro speaks whatever phonemes it is given, in the timbre and rhythm of the
voice embedding it is given. The phonemiser (Piper's espeak bridge) only knows
`en-us`, so every voice -- including Kokoro's four Hindi-trained ones -- was
being handed AMERICAN pronunciation: flapped t in "water", a bunched r, glided
"day" and "go". A Hindi-trained voice reading American phonemes sounds like an
Indian speaker doing an American accent, which is the uncanny thing to avoid.

So the accent is carried twice: by the voice (hf_*/hm_*, trained on Indian
speech) and by the phonemes, rewritten here to the well-described features of
General Indian English:

  t d        -> retroflex t d        the single strongest marker
  th (thin)  -> aspirated dental t   "three" -> "tree" with breath
  th (this)  -> dental d             "the" -> "de"
  w, v       -> one labiodental v    "what", "very" share a sound
  day, go    -> pure e:, o:          no American glide
  lot        -> o                    "job", "dot", "project"
  water      -> t, not a flap        no American "wadder"
  r          -> tapped r, and kept after vowels       (FULL only)
  cut        -> schwa;  cat -> e                       (FULL only)

LIGHT keeps the American r and vowels and changes only the consonants and the
glides -- the more neutral, "corporate" Indian English. FULL adds rhoticity
and the vowel shifts, which reads as more regional. Which one sounds natural
is a judgement for an Indian listener, not something this file can decide.

The vocabulary check matters: Kokoro silently DROPS any phoneme it has no id
for, so a mapping to a symbol it lacks would delete sounds rather than change
them. Every target symbol here is in Kokoro's vocab -- `ʈ ɖ ɾ ʋ ː ʰ` -- which
is checked in `check_vocab`.
"""

TARGETS = ["ʈ", "ɖ", "ɾ", "ʋ", "ː", "ʰ", "ə", "ɛ", "ɔ", "e", "o", "a", "t", "d", "ɪ"]

_AFFRICATES = [("dʒ", "\x01"), ("tʃ", "\x02")]


def indianize(ipa: str, level: str = "full") -> str:
    if level not in ("light", "full"):
        raise ValueError(f"level must be light or full, not {level!r}")
    s = ipa
    # Vowels first, while the r that follows them is still recognisable.
    s = s.replace("ɑːɹ", "aːɹ")          # car, start: open a, r kept for later
    s = s.replace("ɑː", "ɔ")             # lot: job, dot, project
    s = s.replace("oʊ", "oː").replace("eɪ", "eː")
    # The American flap is a t that Indian English never flaps. Must run
    # before r becomes a tap, or the two would be indistinguishable.
    s = s.replace("ɾ", "ʈ")
    # Retroflex stops -- but never inside an affricate: "j" and "ch" keep
    # their own place of articulation.
    for a, tok in _AFFRICATES:
        s = s.replace(a, tok)
    s = s.replace("t", "ʈ").replace("d", "ɖ")
    for a, tok in _AFFRICATES:
        s = s.replace(tok, a)
    # Dental fricatives become dental STOPS -- after the retroflex step, so
    # they stay dental rather than being swept into it.
    s = s.replace("θ", "tʰ").replace("ð", "d")
    s = s.replace("w", "ʋ").replace("v", "ʋ")
    s = s.replace("ᵻ", "ɪ")
    if level == "full":
        s = s.replace("ɚ", "əɾ").replace("ɜː", "əɾ").replace("ɹ", "ɾ")
        s = s.replace("ʌ", "ə").replace("æ", "ɛ")
    return s


def check_vocab(vocab: dict) -> list[str]:
    """Symbols this module emits that Kokoro would silently drop."""
    return [c for c in TARGETS if c not in vocab]


if __name__ == "__main__":
    import sys
    for line in sys.stdin:
        print(indianize(line.rstrip("\n"), sys.argv[1] if len(sys.argv) > 1 else "full"))
