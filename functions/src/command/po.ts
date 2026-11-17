import { barsToStockUnit } from "../shared/steel";
import { lookupTax } from "../shared/hsnTable";
import { exGstRate } from "../shared/poTax";

const GST_OK = [0, 0.25, 3, 5, 12, 18, 28, 40];

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
  items: {
    itemId: string; materialId: string; name: string; unit: string; orderedQty: number; rate: number; hsn: string; gstRate: number; rateFromRequest: boolean;
    /** Steel asked for by count: the bars and the weight working, shown in the preview. */
    nos?: number; conversion?: string;
    /** Where HSN/GST came from when not from the material itself: Sitetru's checked list, or an AI suggestion. */
    taxSource?: "list" | "ai"; taxNote?: string;
    /** The rate as said, including GST; `rate` is then worked back to the rate before tax. */
    rateInclGst?: number;
  }[];
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
- "vendorId": the vendor named in the request, matched by meaning and spelling mistakes ("abc" = "ABC TRADERS"). null if none is named or none matches.
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
    if (!m) continue;
    // Steel by count: the model reads the count, the weight is arithmetic.
    const nos = Math.round(pos(it?.nos));
    const bars = nos ? barsToStockUnit(m.name, m.unit, nos) : null;
    const qty = bars ? bars.qty : pos(it?.qty) || nos;
    if (!qty) continue;
    const stated = pos(it?.rate);
    const prev = items.find((x) => x.itemId === m.id);
    if (prev) {
      prev.orderedQty = Math.round((prev.orderedQty + qty) * 1000) / 1000;
      if (bars && prev.nos) {
        const both = barsToStockUnit(m.name, m.unit, prev.nos + nos)!;
        Object.assign(prev, { orderedQty: both.qty, nos: prev.nos + nos, conversion: both.working });
      }
      continue;
    }
    const tax = taxFor(m, it);
    // "325 a bag including GST": the PO carries the rate before tax and the GST
    // separately, so work the rate back. Without a GST rate it stays as said.
    const incl = !!stated && it?.rateIncludesGst === true && tax.gstRate > 0;
    items.push({
      itemId: m.id, materialId: m.materialId || "", name: m.name, unit: m.unit, orderedQty: qty,
      rate: incl ? exGstRate(stated, tax.gstRate) : stated || m.rate || 0, rateFromRequest: !!stated,
      ...(incl ? { rateInclGst: stated } : {}),
      ...(bars ? { nos, conversion: bars.working } : {}),
      ...tax,
    });
  }
  // Steel ordered by count: tell the vendor the count too.
  const counted = items.filter((i) => i.nos).map((i) => `${i.name}: ${i.nos} nos (${i.orderedQty} ${i.unit})`);
  const notes = [clip(raw.notes, 200), counted.length ? `Bars of 12 m: ${counted.join("; ")}` : ""].filter(Boolean).join(". ").slice(0, 500);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.expectedDeliveryDate || "")) && String(raw.expectedDeliveryDate) >= ctx.today ? String(raw.expectedDeliveryDate) : "";
  return {
    kind: "po",
    transcript,
    unmatched,
    missingVendor: !vendor,
    draft: { vendorId: vendor?.id || "", vendorName: vendor?.name || "", expectedDeliveryDate: date, notes, items },
  };
}

/**
 * HSN and GST for a PO line. The material's own values unless Sitetru's
 * checked list says otherwise (an empty HSN, or a rate that has since changed,
 * e.g. cement saved at 28%); for materials not on the list and with no HSN,
 * the model's suggestion, marked for checking.
 */
function taxFor(m: PoContext["materials"][number], it: any): Pick<PoDraft["items"][number], "hsn" | "gstRate" | "taxSource" | "taxNote"> {
  const own = { hsn: String(m.hsn || "").replace(/\D/g, ""), gstRate: Number(m.gstRate) || 0 };
  const listed = lookupTax(m.name);
  if (listed) {
    const notes: string[] = [];
    if (!own.hsn) notes.push("HSN added");
    else if (own.hsn.slice(0, 4) !== listed.hsn) notes.push(`HSN ${own.hsn} on file`);
    if (own.gstRate !== listed.gstRate) notes.push(`GST was ${own.gstRate}%, current rate is ${listed.gstRate}%`);
    if (!notes.length) return own;
    const hsn = own.hsn && own.hsn.slice(0, 4) === listed.hsn ? own.hsn : listed.hsn;
    return { hsn, gstRate: listed.gstRate, taxSource: "list", taxNote: `${notes.join("; ")} (Sitetru's checked list)` };
  }
  if (own.hsn) return own;
  const hsn = String(it?.hsn ?? "").replace(/\D/g, "");
  const gst = Number(it?.gstRate);
  if ([4, 6, 8].includes(hsn.length) && GST_OK.includes(gst)) {
    return { hsn, gstRate: gst, taxSource: "ai", taxNote: "AI suggestion, please check" };
  }
  return own;
}

/** Audio the browser may send: what MediaRecorder produces on Android, iOS and desktop. */
export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-m4a"];
export const MAX_AUDIO_BASE64 = 2_800_000; // about 2 MB of audio: a minute and more at voice bitrates
