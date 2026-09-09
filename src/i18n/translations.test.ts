import { describe, it, expect } from "vitest";
import { translations } from "./translations";

const en = translations.en;
const ta = translations.ta;
const TAMIL = /[஀-௿]/;

/**
 * Guards for the translation table while the app's remaining hardcoded strings
 * are moved into it. The table is complete today; these exist so that adding
 * to it cannot quietly leave a key English-only, which is invisible in review
 * and only shows up as English text on a Tamil user's screen.
 */

/**
 * Values that are correctly identical or correctly not Tamil.
 *  - lang.*        label the languages themselves; switchTo is deliberately
 *                  inverted, showing the language you would switch TO.
 *  - {…} only      pure interpolation, no words to translate.
 *  - placeholders  an example project name, fine to leave as-is.
 */
const ALLOW_UNTRANSLATED = new Set([
  "lang.english",
  "lang.tamil",
  "lang.switchTo",
  "portfolio.greeting",
  "cpm.workspacePlaceholder",
  "wbs.title", // an acronym; "WBS" in both
]);

/**
 * Keys whose Tamil value is deliberately EMPTY.
 *
 * These are the "Pre" halves of sentences wrapped around a value:
 *
 *   en: {accessPausedPre} <b>{org}</b> {accessPausedPost}
 *       "Access to"          Acme       "is paused…"
 *
 * Tamil is postpositional, so the case ending attaches to the org name and
 * the whole sentence follows it — accessPausedPost begins "க்கான…". There is
 * nothing to say before the value, so Pre is empty by design. Filling these
 * in would put a stray word in front of the name.
 */
const ALLOW_EMPTY_TA = new Set([
  "paywall.accessPausedPre",
  "paywall.choosePlanPre",
  "onb.signedInAs",
]);

describe("translation table", () => {
  it("has the same keys in both locales", () => {
    expect(Object.keys(ta).sort()).toEqual(Object.keys(en).sort());
  });

  it("has no unexplained empty values", () => {
    const blankEn = Object.entries(en).filter(([, v]) => !String(v).trim());
    expect(blankEn.map(([k]) => k)).toEqual([]);
    const blankTa = Object.entries(ta)
      .filter(([, v]) => !String(v).trim())
      .map(([k]) => k)
      .filter((k) => !ALLOW_EMPTY_TA.has(k));
    expect(blankTa).toEqual([]);
  });

  it("keeps a Post half for every deliberately empty Pre half", () => {
    // An empty Pre with no Post carrying the words is a sentence with nothing
    // in it, which is the failure mode this pattern risks.
    for (const pre of ALLOW_EMPTY_TA) {
      const post = pre.replace(/Pre$/, "Post");
      const paired = post === pre ? "onb.joinTeamPost" : post;
      expect(String(ta[paired] ?? "").trim().length, `${pre} needs ${paired}`).toBeGreaterThan(0);
    }
  });

  it("has Tamil text on every Tamil value that contains words", () => {
    const englishOnly = Object.keys(en).filter((k) => {
      if (ALLOW_UNTRANSLATED.has(k)) return false;
      const v = String(ta[k] ?? "");
      // A value with no letters at all (a number, a symbol) needs no Tamil.
      if (!/[A-Za-z]{3}/.test(v)) return false;
      if (ALLOW_EMPTY_TA.has(k)) return false;
      return !TAMIL.test(v);
    });
    expect(englishOnly).toEqual([]);
  });

  it("keeps every interpolation placeholder in the Tamil value", () => {
    const mismatched: string[] = [];
    for (const [k, v] of Object.entries(en)) {
      const want = (String(v).match(/\{\w+\}/g) ?? []).sort();
      const got = (String(ta[k] ?? "").match(/\{\w+\}/g) ?? []).sort();
      if (want.join(",") !== got.join(",")) mismatched.push(k);
    }
    // A dropped {name} or {count} renders as a sentence with a hole in it.
    expect(mismatched).toEqual([]);
  });

  it("does not leave a key in either allowlist that no longer exists", () => {
    const stale = [...ALLOW_UNTRANSLATED, ...ALLOW_EMPTY_TA].filter((k) => !(k in en));
    expect(stale).toEqual([]);
  });
});
