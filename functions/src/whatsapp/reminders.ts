import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { WhatsAppApi } from "./api";
import { getSession } from "../telegram/session";
import { withinServiceWindow, toPhone } from "../bot/channel";
import { tt, normalizeLang } from "../telegram/i18n";
import * as agent from "../telegram/handlers/agent";
import { db } from "../db";

const WA_TOKEN = defineSecret("WHATSAPP_TOKEN");
const WA_PHONE_ID = defineSecret("WHATSAPP_PHONE_NUMBER_ID");

/**
 * The daily nudges, and the one place WhatsApp's economics differ from
 * Telegram's rather than just its widgets.
 *
 * Telegram will deliver a bot message to anyone who has ever started the bot,
 * whenever, for nothing. WhatsApp will not. Free-form messages are only allowed
 * inside a 24-hour "customer service window" that opens each time the person
 * messages the business. Outside it, the ONLY thing that gets through is a
 * template Meta has approved in advance, and it is billed per conversation.
 *
 * So the 5 PM nudge cannot simply be ported. An engineer who logged this
 * afternoon is inside the window and gets the full interactive worklist, free.
 * One who has not written since yesterday is outside it, and gets a template
 * whose only job is to be replied to -- the reply reopens the window and the
 * real worklist follows on the next message.
 *
 * That is why the template is deliberately thin. It is a knock on the door, not
 * the conversation, and every one of them costs money.
 */

/** Meta-approved template names. These must exist in the WhatsApp Manager. */
export const TEMPLATES = {
  /** "Time to log today's progress on {{1}}. Reply to open your worklist." */
  dailyLog: "daily_log_reminder",
  /** "Good morning — plan today's tasks on {{1}}. Reply to start." */
  dailyPlan: "daily_plan_reminder",
} as const;

/** Everyone who has linked WhatsApp. Small user base; a full scan is fine. */
async function linkedUsers(): Promise<{ waId: string }[]> {
  const snap = await db.collection("users").get();
  return snap.docs
    .map((d) => d.data() as any)
    .filter((u) => u.whatsappId)
    .map((u) => ({ waId: String(u.whatsappId) }));
}

export const whatsappLogReminder = onSchedule(
  {
    schedule: "0 17 * * 1-6", // 17:00 Mon-Sat, matching the Telegram nudge
    timeZone: "Asia/Kolkata",
    region: "asia-southeast1",
    secrets: [WA_TOKEN, WA_PHONE_ID],
  },
  async () => {
    const wa = new WhatsAppApi(WA_TOKEN.value(), WA_PHONE_ID.value());
    const targets = await linkedUsers();
    let free = 0;
    let templated = 0;

    for (const { waId } of targets) {
      try {
        const session = await getSession(waId);
        if (withinServiceWindow(session)) {
          if (session?.activeProjectId) {
            if (await agent.sendAgentNudge(wa, waId, session)) free++;
            // No gaps -> stay quiet, same as Telegram.
          } else {
            await wa.sendMessage(waId, tt(normalizeLang(session?.lang), "endOfDayNoProject"));
            free++;
          }
        } else {
          // Outside the window: a template is the only thing that arrives.
          await wa.sendTemplate(toPhone(waId), TEMPLATES.dailyLog, normalizeLang(session?.lang));
          templated++;
        }
      } catch (err) {
        // Blocked the number, opted out, or the template is not approved yet.
        console.error("WhatsApp log reminder failed for", waId, err);
      }
    }
    console.log(
      `WhatsApp log reminder: ${free} free-form, ${templated} billed templates, of ${targets.length} linked.`,
    );
  },
);

export const whatsappPlanReminder = onSchedule(
  {
    schedule: "0 10 * * 1-6", // 10:00 Mon-Sat, matching the Telegram prompt
    timeZone: "Asia/Kolkata",
    region: "asia-southeast1",
    secrets: [WA_TOKEN, WA_PHONE_ID],
  },
  async () => {
    const wa = new WhatsAppApi(WA_TOKEN.value(), WA_PHONE_ID.value());
    const targets = await linkedUsers();
    let free = 0;
    let templated = 0;

    for (const { waId } of targets) {
      try {
        const session = await getSession(waId);
        // No active project -> skip, exactly as the Telegram prompt does. Not
        // worth a paid conversation to tell someone there is nothing to plan.
        if (!session?.activeProjectId) continue;
        if (withinServiceWindow(session)) {
          if (await agent.sendPlanPrompt(wa, waId, session)) free++;
        } else {
          await wa.sendTemplate(toPhone(waId), TEMPLATES.dailyPlan, normalizeLang(session?.lang));
          templated++;
        }
      } catch (err) {
        console.error("WhatsApp plan prompt failed for", waId, err);
      }
    }
    console.log(
      `WhatsApp plan prompt: ${free} free-form, ${templated} billed templates, of ${targets.length} linked.`,
    );
  },
);
