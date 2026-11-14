/**
 * Turn an uploaded logo into a small data URL that can be stored with the
 * company profile and drawn straight into a PDF.
 *
 * Stored as a data URL rather than a file in Cloud Storage on purpose: a PDF
 * is built in the browser from the image's bytes, and reading those back from
 * a storage URL needs cross-origin permission on the bucket. A letterhead logo
 * is small enough that keeping the bytes beside the address is simpler and
 * cannot fail that way.
 */

const MAX_W = 600;
const MAX_H = 240;
/** Comfortably under the 300,000-character cap in firestore.rules. */
export const MAX_LOGO_CHARS = 250000;

export async function logoToDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error("Use a PNG or JPG image for the logo.");
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is too large. Use one under 8 MB.");
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("That file isn't an image we can read."));
    i.src = src;
  });
  const scale = Math.min(1, MAX_W / img.width, MAX_H / img.height);
  const draw = (factor: number, type: "image/png" | "image/jpeg") => {
    const w = Math.max(1, Math.round(img.width * scale * factor));
    const h = Math.max(1, Math.round(img.height * scale * factor));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't process the image.");
    if (type === "image/jpeg") {
      // JPEG has no transparency; a transparent logo would turn black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL(type, 0.9);
  };
  // PNG keeps a transparent background and sharp edges; fall back to JPEG,
  // then to a smaller size, only if it would not fit.
  for (const [factor, type] of [[1, "image/png"], [1, "image/jpeg"], [0.6, "image/png"], [0.6, "image/jpeg"], [0.35, "image/jpeg"]] as const) {
    const out = draw(factor, type);
    if (out.length <= MAX_LOGO_CHARS) return out;
  }
  throw new Error("That logo is too detailed to store. Try a simpler or smaller image.");
}
