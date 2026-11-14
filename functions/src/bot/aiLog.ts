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

export interface AiLogContext {
  tasks: Array<{ id: string; name: string; progress: number }>;
  materials: Array<{ id: string; name: string; unit: string }>;
  roles: Array<{ id: string; name: string }>;
  equipment: Array<{ id: string; name: string }>;
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
- Location words ("first floor", "south side", "above lintel") help you choose the task; also keep them in "note".

Rules:
- "intent" is "daily_log" when the message reports work done, materials used, labour or equipment on site. Otherwise "other".
- "taskId" is the single task the message is about, or null if you cannot tell which one.
- "progressPercent" is the task's TOTAL progress after today (0-100). If the message gives an increase ("10% more", "another 10 percent"), add it to the current progress. If it says the task is finished, use 100. If progress is not mentioned, use null.
- Quantities are numbers in the material's own unit as listed. Do not convert units; if the unit in the message differs from the listed unit, put the item in "unmatched" instead.
- "equipment[].unit" is "hours" or "days".
- "note" is anything worth recording that is not captured above (weather, delays, instructions), in English, at most 200 characters. Empty string if nothing.

Answer with JSON only, in exactly this shape:
{"intent":"daily_log","taskId":"...","progressPercent":40,"materials":[{"materialId":"...","quantity":1}],"labour":[{"roleId":"...","headcount":1}],"equipment":[{"equipmentId":"...","quantity":1,"unit":"hours"}],"note":"","unmatched":[]}

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
      if (prev) (prev as any)[field] = Number((prev as any)[field]) + Number((r as any)[field]);
      else map.set(k, { ...r });
    }
    return [...map.values()];
  };

  const materials = merge(
    (Array.isArray(raw.materials) ? raw.materials : []).flatMap((m: any) => {
      const item = ctx.materials.find((x) => x.id === String(m?.materialId ?? ""));
      const quantity = posNum(m?.quantity);
      return item && quantity ? [{ materialId: item.id, name: item.name, unit: item.unit || "", quantity }] : [];
    }),
    (r: any) => r.materialId, "quantity",
  ) as AiLogDraft["materials"];

  const labour = merge(
    (Array.isArray(raw.labour) ? raw.labour : []).flatMap((l: any) => {
      const role = ctx.roles.find((x) => x.id === String(l?.roleId ?? ""));
      const headcount = Math.floor(posNum(l?.headcount));
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

  return {
    kind: "log",
    draft: {
      taskId: task.id, taskName: task.name, currentProgress: current, progressPercent, progressGiven: given,
      materials, labour, equipment, note: clip(raw.note, 200), unmatched,
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
