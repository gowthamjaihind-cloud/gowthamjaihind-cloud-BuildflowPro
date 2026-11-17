/**
 * "Create a PO for 100 bags of cement from ABC Traders, deliver Friday",
 * typed or spoken in the app's command chat, as a draft purchase order.
 *
 * The model only chooses from this project's own vendors and materials, and
 * everything it answers is checked here against those lists: an invented
 * vendor, material or id never reaches the form. Nothing is saved from the
 * request alone -- the app opens the usual Create Purchase Order form filled
 * in, and the user presses Create. Pure: no Firestore, no clock.
 */

export interface PoContext {
  today: string; // YYYY-MM-DD, India
  vendors: { id: string; name: string }[];
  materials: { id: string; materialId?: string; name: string; unit: string; rate: number; hsn: string; gstRate: number }[];
}

export interface PoDraft {
  vendorId: string;
  vendorName: string;
  expectedDeliveryDate: string;
  notes: string;
  items: { itemId: string; materialId: string; name: string; unit: string; orderedQty: number; rate: number; hsn: string; gstRate: number; rateFromRequest: boolean }[];
}

export type CommandResult =
  | { kind: "po"; draft: PoDraft; transcript: string; unmatched: string[]; missingVendor: boolean }
  | { kind: "other"; transcript: string; reply: string };

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const pos = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function buildCommandPrompt(ctx: PoContext, text: string | null): string {
  const list = (rows: string[]) => (rows.length ? rows.join("\n") : "(none)");
  return `You turn a construction company's typed or spoken request into an action in their project management app.
The request may be in English, Tamil, Hindi, or a mix (written in any script, or spoken).
${text === null ? "The request is the attached audio. Write what was said, in its original language, as \"transcript\"." : `REQUEST: ${clip(text, 1500)}`}

The only action you can prepare is creating a PURCHASE ORDER for this project.
Choose ONLY from the lists below and answer with their ids. Never invent an id.

VENDORS (id | name):
${list(ctx.vendors.map((v) => `${v.id} | ${v.name}`))}

MATERIALS (id | name | unit | usual rate in rupees):
${list(ctx.materials.map((m) => `${m.id} | ${m.name} | ${m.unit} | ${m.rate || "?"}`))}

Rules:
- "intent" is "create_po" when the request asks to order, buy, purchase or raise a PO for materials. Otherwise "other".
- "vendorId": the vendor named in the request, matched by meaning and spelling mistakes ("vaigai" = "ABC TRADERS"). null if none is named or none matches.
- "items": one per material: "itemId" from MATERIALS, "qty" in the material's own unit, "rate" only if the request states a price per unit, else null. Common site words: "bags" of cement, "MT"/"ton" of steel, "units"/"loads" of sand, "nos" = pieces.
- Anything asked for that matches no material goes in "unmatched", in the user's words.
- "expectedDeliveryDate": the delivery date if one is said ("Friday", "tomorrow", "25th"), as YYYY-MM-DD, never before today. Today is ${ctx.today}. null if none.
- "notes": anything else worth putting on the PO (site, instructions), at most 200 characters, in English. "" if nothing.
- For "other", put a one-sentence reply in "reply" explaining that, for now, you can prepare purchase orders, with an example.

Answer with JSON only, in exactly this shape:
{"intent":"create_po","transcript":"","vendorId":null,"items":[{"itemId":"...","qty":1,"rate":null}],"expectedDeliveryDate":null,"notes":"","unmatched":[],"reply":""}`;
}

export function sanitizeCommand(raw: any, ctx: PoContext, typedText: string | null): CommandResult {
  const transcript = typedText ?? clip(raw?.transcript, 1500);
  if (!raw || raw.intent !== "create_po") {
    return { kind: "other", transcript, reply: clip(raw?.reply, 300) || 'For now I can prepare purchase orders. Try: "Order 100 bags of cement from ABC Traders, deliver on Friday".' };
  }
  const vendor = ctx.vendors.find((v) => v.id === String(raw.vendorId ?? ""));
  const unmatched: string[] = (Array.isArray(raw.unmatched) ? raw.unmatched : []).map((u: unknown) => clip(u, 80)).filter(Boolean).slice(0, 8);
  const items: PoDraft["items"] = [];
  for (const it of Array.isArray(raw.items) ? raw.items.slice(0, 30) : []) {
    const m = ctx.materials.find((x) => x.id === String(it?.itemId ?? ""));
    const qty = pos(it?.qty);
    if (!m || !qty) continue;
    const stated = pos(it?.rate);
    const prev = items.find((x) => x.itemId === m.id);
    if (prev) {
      prev.orderedQty += qty;
      continue;
    }
    items.push({ itemId: m.id, materialId: m.materialId || "", name: m.name, unit: m.unit, orderedQty: qty, rate: stated || m.rate || 0, hsn: m.hsn || "", gstRate: m.gstRate || 0, rateFromRequest: !!stated });
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.expectedDeliveryDate || "")) && String(raw.expectedDeliveryDate) >= ctx.today ? String(raw.expectedDeliveryDate) : "";
  return {
    kind: "po",
    transcript,
    unmatched,
    missingVendor: !vendor,
    draft: { vendorId: vendor?.id || "", vendorName: vendor?.name || "", expectedDeliveryDate: date, notes: clip(raw.notes, 200), items },
  };
}

/** Audio the browser may send: what MediaRecorder produces on Android, iOS and desktop. */
export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-m4a"];
export const MAX_AUDIO_BASE64 = 2_800_000; // about 2 MB of audio: a minute and more at voice bitrates
