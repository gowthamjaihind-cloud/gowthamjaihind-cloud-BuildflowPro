import { translations } from "./translations";

/**
 * Interface copy, in English.
 *
 * The web app used to be bilingual. It is not any more, and the reason is worth
 * recording: the catalogue reached 478 translated keys and then stalled with 572
 * strings still hardcoded, concentrated in the office screens -- cost
 * management, procurement, inventory -- while the site-facing screens were done.
 * A half-translated interface is worse than an English one: someone who switches
 * to Tamil and then meets English on every cost screen trusts the product less
 * than someone who was never offered the switch.
 *
 * Tamil did not go away, it moved to where it is actually used. The TELEGRAM BOT
 * is fully bilingual -- functions/src/telegram/i18n.ts, both languages complete,
 * switched per chat with /language -- and that is the tool site engineers work
 * in. The people who use these screens are the PM, the owner and the accountant,
 * who are already in English for GST filings, Tally and bank statements.
 *
 * WBS template names keep their Tamil (`nameTa` in lib/wbsTemplates.ts). Those
 * are not interface copy: applying a template writes them into Firestore as the
 * project's task list, and the bot then shows those names to the engineer. Seed
 * them in English and the bot's Tamil breaks at the one place it matters.
 *
 * The dictionary stays as a single place to find and change user-facing wording,
 * which is useful on its own. It is simply no longer a translation layer.
 */
export function translate(key: string, params?: Record<string, string | number>): string {
  let value = translations.en[key];
  if (value === undefined) return key; // never render blank
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return value;
}

/** Hook form, kept so the ~650 existing `t("key")` call sites are unchanged. */
export function useTranslation() {
  return { t: translate };
}
