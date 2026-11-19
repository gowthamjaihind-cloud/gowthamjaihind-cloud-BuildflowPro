/**
 * Turning a site engineer's plain-language message into a daily-log draft.
 *
 * The model is asked to pick from the project's OWN lists (tasks, materials,
 * labour roles, equipment) and answer with ids. Everything it returns is then
 * checked here against those same lists: an id that is not on the list is
 * dropped, a quantity that is not a positive number is dropped, and progress is
 * clamped. So a wrong or invented answer can lose an item (which the engineer
 * sees and can add back with the buttons) but can never write a material or a
 * task that does not exist.
 *
 * Pure: no Firestore and no network, so the checking is unit-tested.
 */
import { barsToStockUnit } from "../shared/steel";

export interface AiLogContext {
  tasks: Array<{ id: string; name: string; progress: number }>;
  materials: Array<{ id: string; name: string; unit: string }>;
  roles: Array<{ id: string; name: string }>;
  equipment: Array<{ id: string; name: string }>;
  /** Today in India, YYYY-MM-DD: the latest date a log may carry. */
  today?: string;
}

export interface AiLogDraft {
  taskId: string;
  taskName: string;
  currentProgress: number;
  /** Absolute percent after today's work. Equals currentProgress when none was given. */
  progressPercent: number;
  progressGiven: boolean;
  materials: Array<{ materialId: string; name: string; unit: string; quantity: number }>;
  labour: Array<{ roleId: string; roleName: string; headcount: number }>;
  equipment: Array<{ equipmentId: string; name: string; unit: string; quantity: number }>;
  note: string;
  /** Things the engineer mentioned that matched nothing on the project's lists. */
  unmatched: string[];
  /** YYYY-MM-DD the work was done, when the message gave a usable date. */
  workDate?: string;
}

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const posNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The instruction sent to the model, with the project's lists inlined. */
export function buildAiLogPrompt(message: string, ctx: AiLogContext): string {
  const list = (rows: string[]) => (rows.length ? rows.join("\n") : "(none)");
  return `You convert a construction site engineer's message into a structured daily work log.
The message may be in English, Tamil, Hindi, or a mix written in English letters.

Choose ONLY from the lists below and answer with their ids. Never invent an id.
If something in the message matches nothing on a list, put it in "unmatched" in the engineer's own words.

TASKS (id | name | current progress %):
${list(ctx.tasks.map((t) => `${t.id} | ${t.name} | ${t.progress}`))}

MATERIALS (id | name | unit):
${list(ctx.materials.map((m) => `${m.id} | ${m.name} | ${m.unit}`))}

LABOUR ROLES (id | name):
${list(ctx.roles.map((r) => `${r.id} | ${r.name}`))}

EQUIPMENT (id | name):
${list(ctx.equipment.map((e) => `${e.id} | ${e.name}`))}

Site shorthand engineers use (match by MEANING, not exact spelling):
- "MC" = male coolie / male helper / mazdoor; "FC" = female coolie / female helper. Match them to the labour role that means the same, e.g. a role named "Male Coolie", "Male Helper", "MC", "Mazdoor".
- "mestri" / "maistry" = mason or head mason; "bar bender" = steel fixer; "carpenter" = shuttering carpenter.
- "no.", "nos", "nos." after a number = that many people or pieces.
- Units: "bags", "kg", "MT"/"ton", "cft", "cum"/"m3", "sqft", "rmt". Spelling mistakes are common ("lentel" = lintel, "cement bag" = bags of cement).
- Tamil Nadu material names: "jalli" = crushed stone aggregate ("big jalli" / "40mm jalli" = 40mm aggregate; "small jalli" / "20mm jalli" / "12mm jalli" = that size); "msand" / "M-sand" = manufactured sand; "psand" / "P-sand" = plastering sand; "kambi" = steel bar; "sengal" = brick. Match them to the material that means the same.
- Location words ("first floor", "south side", "above lintel") help you choose the task; also keep them in "note".

Rules:
- "intent" is "daily_log" when the message reports work done, materials used, labour or equipment on site. Otherwise "other".
- A message can report work on SEVERAL tasks. Return one entry in "logs" per task, at most 5. Never put two tasks in one entry.
- Each entry's "taskId" is that task's id. Leave out work you cannot match to a task, and name it in "unmatched".
- A message is often written as sections: a work heading ("Earth work excavation", "Barbending work") followed by its labour, materials and equipment. Everything under a heading belongs to THAT heading's task.
- A heading that matches no task is usually work done as PART of another task: bar bending for the reinforcement placed during excavation or footing, shuttering for a slab, curing for concrete. Put its items on the task it supports (normally one named in the same message; otherwise the first task), and record it in "placed" as {"heading": "<the heading as written>", "taskId": "<the task it went to>"}. Do not put such a heading in "unmatched".
- Labour, materials and equipment listed once for the whole day, under no heading: give each item to the task it plainly belongs to (bar benders to bar bending, masons to block or brick work, excavator hours to excavation). An item you cannot place goes on the first task.
- A finished task (progress 100) can still be reported on; match it like any other.
- Each entry's "progressPercent" is that task's TOTAL progress after today (0-100). If the message gives an increase ("10% more", "another 10 percent"), add it to the current progress. If it says the task is finished, use 100. If progress is not mentioned, use null.
- Quantities are numbers in the material's own unit as listed. Do not convert units; if the unit in the message differs from the listed unit, put the item in "unmatched" instead.
- One exception: steel bars given as a COUNT ("Steel 8mm 20 nos", "12mm kambi 15 rods") for a bar material listed in kg or MT of the SAME size. Give {"materialId":"...","nos":20} with no "quantity"; the weight is worked out for you. Never work out a weight yourself.
- "equipment[].unit" is "hours" or "days".
- "workDate" is the date the work was done if the message states one, as "YYYY-MM-DD". Dates are written day first in India: "12/11/26" is 12 November 2026. Use null if no date is given. Today is ${ctx.today || "unknown"}.
- Each entry's "note" is anything worth recording about that task that is not captured above (weather, delays, instructions), in English, at most 200 characters. Empty string if nothing.

Answer with JSON only, in exactly this shape:
{"intent":"daily_log","workDate":null,"logs":[{"taskId":"...","progressPercent":40,"materials":[{"materialId":"...","quantity":1}],"labour":[{"roleId":"...","headcount":1.5}],"equipment":[{"equipmentId":"...","quantity":1,"unit":"hours"}],"note":""}],"placed":[],"unmatched":[]}

MESSAGE:
${clip(message, 1200)}`;
}

export type AiLogResult =
  | { kind: "log"; draft: AiLogDraft }
  | { kind: "no_task"; unmatched: string[] }
  | { kind: "other" };

/** Check the model's answer against the project's lists. See the file comment. */
export function sanitizeAiLog(raw: any, ctx: AiLogContext): AiLogResult {
  if (!raw || typeof raw !== "object" || raw.intent !== "daily_log") return { kind: "other" };
  const unmatched = (Array.isArray(raw.unmatched) ? raw.unmatched : []).map((u: unknown) => clip(u, 80)).filter(Boolean).slice(0, 8);
  const task = ctx.tasks.find((t) => t.id === String(raw.taskId ?? ""));
  if (!task) return { kind: "no_task", unmatched };

  const current = Math.max(0, Math.min(100, Math.round(Number(task.progress) || 0)));
  const p = raw.progressPercent;
  const given = p !== null && p !== undefined && Number.isFinite(Number(p));
  // Progress on a task does not go backwards from a chat message: a lower
  // figure is far more likely a misreading than a correction.
  const progressPercent = given ? Math.max(current, Math.min(100, Math.round(Number(p)))) : current;

  const merge = <T extends { quantity?: number; headcount?: number }>(rows: T[], key: (r: T) => string, field: "quantity" | "headcount") => {
    const map = new Map<string, T>();
    for (const r of rows) {
      const k = key(r);
      const prev = map.get(k);
      if (prev) (prev as any)[field] = Math.round((Number((prev as any)[field]) + Number((r as any)[field])) * 1000) / 1000;
      else map.set(k, { ...r });
    }
    return [...map.values()];
  };

  const steelWorking: string[] = [];
  const materials = merge(
    (Array.isArray(raw.materials) ? raw.materials : []).flatMap((m: any) => {
      const item = ctx.materials.find((x) => x.id === String(m?.materialId ?? ""));
      if (!item) return [];
      // Bars by count: the weight is arithmetic (shared/steel, the same as
      // purchase orders), never the model's guess, and the working is shown.
      const nos = posNum(m?.nos);
      if (nos && !posNum(m?.quantity)) {
        const conv = barsToStockUnit(item.name, item.unit || "", nos);
        if (!conv) return [];
        steelWorking.push(conv.working);
        return [{ materialId: item.id, name: item.name, unit: item.unit || "", quantity: conv.qty }];
      }
      const quantity = posNum(m?.quantity);
      return quantity ? [{ materialId: item.id, name: item.name, unit: item.unit || "", quantity }] : [];
    }),
    (r: any) => r.materialId, "quantity",
  ) as AiLogDraft["materials"];

  const labour = merge(
    (Array.isArray(raw.labour) ? raw.labour : []).flatMap((l: any) => {
      const role = ctx.roles.find((x) => x.id === String(l?.roleId ?? ""));
      // To one decimal: 2.5 = two full shifts and a half.
      const headcount = Math.round(posNum(l?.headcount) * 10) / 10;
      return role && headcount ? [{ roleId: role.id, roleName: role.name, headcount }] : [];
    }),
    (r: any) => r.roleId, "headcount",
  ) as AiLogDraft["labour"];

  const equipment = (Array.isArray(raw.equipment) ? raw.equipment : []).flatMap((e: any) => {
    const item = ctx.equipment.find((x) => x.id === String(e?.equipmentId ?? ""));
    const quantity = posNum(e?.quantity);
    const unit = String(e?.unit) === "days" ? "days" : "hours";
    return item && quantity ? [{ equipmentId: item.id, name: item.name, unit, quantity }] : [];
  }) as AiLogDraft["equipment"];

  const workDate = acceptWorkDate(raw.workDate, ctx.today);
  return {
    kind: "log",
    draft: {
      // "Given" means the message moved the task on. A model that echoes the
      // current figure back (or answers 0 for "not mentioned") did not, and
      // the engineer is told progress was kept as it was.
      taskId: task.id, taskName: task.name, currentProgress: current, progressPercent, progressGiven: given && progressPercent > current,
      materials, labour, equipment, note: clip([clip(raw.note, 200), ...steelWorking.map((w) => `Steel ${w}`)].filter(Boolean).join("; "), 300), unmatched,
      ...(workDate ? { workDate } : {}),
    },
  };
}

/** Is this message worth sending to the model at all? */
export function looksLikeLogText(text: string): boolean {
  const t = String(text || "").trim();
  if (t.startsWith("/")) return false;
  // A bare number or a one-word reply belongs to a button flow, not to this.
  return t.length >= 8 && /\s/.test(t) && /[A-Za-zऀ-ॿ஀-௿]/.test(t);
}


/**
 * The model's answer as an object. Asked for bare JSON, it still sometimes
 * wraps it in a code fence or adds a sentence; take the outermost {...}.
 * Throws when there is no object to be found.
 */
export function parseModelJson(text: string): any {
  const t = String(text || "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error(`model answer had no JSON object: ${t.slice(0, 120)}`);
    return JSON.parse(t.slice(start, end + 1));
  }
}


/**
 * A date the engineer gave for the work, if it is one a daily log may carry:
 * a real calendar date, not in the future, and at most 7 days back. Anything
 * else is ignored and the log is dated today, as before.
 */
export function acceptWorkDate(v: unknown, today: string | undefined): string | undefined {
  const s = String(v ?? "");
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = Date.parse(`${s}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(d) || new Date(d).toISOString().slice(0, 10) !== s) return undefined;
  if (d > t || t - d > 7 * 86400000) return undefined;
  return s;
}


export type AiLogsResult =
  | { kind: "logs"; drafts: AiLogDraft[]; unmatched: string[]; placed: { heading: string; taskName: string }[] }
  | { kind: "no_task"; unmatched: string[] }
  | { kind: "other" };

/** The most separate logs one message may produce. */
export const MAX_LOGS_PER_MESSAGE = 5;

/**
 * One message, one log per task it mentions. Each entry is checked exactly as
 * a single log is (sanitizeAiLog): unknown ids dropped, quantities positive,
 * progress never backwards. An entry for a task that does not exist is
 * dropped rather than guessed. Two entries for the same task are merged. An
 * answer in the older single-task shape is still accepted.
 */
export function sanitizeAiLogs(raw: any, ctx: AiLogContext): AiLogsResult {
  if (!raw || typeof raw !== "object" || raw.intent !== "daily_log") return { kind: "other" };
  const unmatched: string[] = (Array.isArray(raw.unmatched) ? raw.unmatched : []).map((u: unknown) => clip(u, 80)).filter(Boolean).slice(0, 8);
  const entries: any[] = Array.isArray(raw.logs) ? raw.logs : raw.taskId !== undefined ? [raw] : [];
  const byTask = new Map<string, AiLogDraft>();
  for (const e of entries.slice(0, 20)) {
    const r = sanitizeAiLog({ ...e, intent: "daily_log", workDate: e?.workDate ?? raw.workDate, unmatched: [] }, ctx);
    if (r.kind !== "log") continue;
    const d = r.draft;
    const prev = byTask.get(d.taskId);
    if (!prev) {
      byTask.set(d.taskId, d);
      continue;
    }
    // Same task twice: one log, items added together, the higher progress.
    const add = <T>(a: T[], b: T[], key: (x: T) => string, field: string) => {
      const out = a.map((x) => ({ ...x }));
      for (const x of b) {
        const hit: any = out.find((y) => key(y) === key(x));
        if (hit) hit[field] = Math.round((Number(hit[field]) + Number((x as any)[field])) * 1000) / 1000;
        else out.push({ ...x });
      }
      return out;
    };
    byTask.set(d.taskId, {
      ...prev,
      progressPercent: Math.max(prev.progressPercent, d.progressPercent),
      progressGiven: prev.progressGiven || d.progressGiven,
      materials: add(prev.materials, d.materials, (x) => x.materialId, "quantity"),
      labour: add(prev.labour, d.labour, (x) => x.roleId, "headcount"),
      equipment: add(prev.equipment, d.equipment, (x) => `${x.equipmentId}|${x.unit}`, "quantity"),
      note: clip([prev.note, d.note].filter(Boolean).join("; "), 200),
    });
  }
  const drafts = [...byTask.values()].slice(0, MAX_LOGS_PER_MESSAGE);
  if (!drafts.length) return { kind: "no_task", unmatched };
  // Work under a heading with no task of its own, added to the task it
  // supports. Shown to the engineer so a wrong guess is caught before Save.
  const placed = (Array.isArray(raw.placed) ? raw.placed : [])
    .map((x: any) => ({ heading: clip(x?.heading, 60), task: drafts.find((d) => d.taskId === String(x?.taskId ?? "")) }))
    .filter((x: any) => x.heading && x.task)
    .map((x: any) => ({ heading: x.heading, taskName: x.task.taskName }))
    .slice(0, 5);
  return { kind: "logs", drafts, unmatched, placed };
}
