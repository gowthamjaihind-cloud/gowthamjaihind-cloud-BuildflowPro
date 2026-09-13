/**
 * Initials for an avatar, when there is no photo.
 *
 * Replaces a call to ui-avatars.com that sent the user's display name to a
 * third party on every page load and rendered a broken-image icon whenever
 * that host was unreachable.
 *
 * Deliberately conservative about what counts as a name part, because this
 * app's users are Indian contractors and the naming conventions are not the
 * ones a naive `split(" ")[0][0] + split(" ")[1][0]` assumes:
 *
 *   - Initials are extremely common as a PREFIX, not a suffix: "B Gowtham",
 *     "R. Karthik", "K.S. Ravi". Taking the first two tokens of "B Gowtham"
 *     gives "BG", which is right; but for "R. Karthik" the dot has to go.
 *   - A single mononym is normal ("Gowtham"), and must not crash or render
 *     one letter against a two-letter layout -- one letter is correct there.
 *   - Tamil script has no case, so `toUpperCase()` is a no-op rather than a
 *     corruption, but combining marks must travel with their base character.
 *     Neither `[0]` nor `Array.from()[0]` does that: "கோ" is TWO code points
 *     (க + the vowel sign ோ), so both return a bare "க" and drop the sign.
 *     A unit test on real Tamil caught this; only grapheme segmentation is
 *     correct, so that is what this uses.
 */

/** First grapheme cluster, not first code point. See the note above. */
function firstGrapheme(s: string): string {
  // Intl.Segmenter is in every browser this app supports and in Node 18+,
  // but it is still worth not exploding where it is absent.
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: "grapheme" });
    for (const { segment } of seg.segment(s)) return segment;
    return "";
  }
  return Array.from(s)[0] ?? "";
}
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "")
    .replace(/[.]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  // First and last, so "K S Ravi" reads KR rather than KS -- the surname is
  // more identifying than a second initial.
  const pick = parts.length === 1 ? [parts[0]] : [parts[0], parts[parts.length - 1]];
  return pick
    .map(firstGrapheme)
    .join("")
    .toUpperCase();
}
