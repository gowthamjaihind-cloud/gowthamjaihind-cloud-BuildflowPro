import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = process.env.OUT_DIR || join(HERE, "out");
mkdirSync(OUT, { recursive: true });

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0E1621;font-family:Manrope,'Noto Sans Tamil',system-ui,sans-serif;display:flex;justify-content:center}
.phone{width:460px;background:#0E1621;display:flex;flex-direction:column}
.bar{background:#17212B;padding:15px 16px;display:flex;align-items:center;gap:12px}
.av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#D97D54,#B85F3B);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff}
.who{color:#fff;font-weight:700;font-size:15px}.sub{color:#7D8E9E;font-size:12px}
.chat{flex:1;padding:16px 12px 28px;display:flex;flex-direction:column;gap:10px}
.row{display:flex}.row.me{justify-content:flex-end}
.b{max-width:88%;padding:10px 14px;border-radius:15px;font-size:15px;line-height:1.5;color:#fff;white-space:pre-line}
.bot{background:#182533;border-bottom-left-radius:5px;min-width:320px}
.me .b{background:#2B5278;border-bottom-right-radius:5px;max-width:70%}
.t{font-size:10.5px;color:#6E7F8D;margin-top:4px;text-align:right}
.kb{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.k{background:#2B3E50;color:#7FC4F5;border-radius:10px;padding:9px 10px;font-size:13.5px;font-weight:600;flex:1 1 46%;text-align:center;white-space:nowrap}
.k.wide{flex-basis:100%}
.k.tap{background:#7FC4F5;color:#12212F;box-shadow:0 0 0 3px rgba(127,196,245,.28)}
.n{flex:1 1 13%}
b{font-weight:800}i{color:#9FB3C4;font-style:normal;font-size:13.5px}
.ok{background:#173A2C;border:1px solid #2E7D57}
.cap{color:#7FC4F5;font-size:11.5px;text-align:center;margin:2px 0 0;font-weight:600;letter-spacing:.04em}
`;

const EN = {
  sub: "bot", tapNote: "tapped",
  msgs: [
    { me: 1, x: "/log", t: "4:42 PM" },
    { x: "<b>Log progress</b>\n<i>Today, 27 Aug</i>\n\nContinue with your last task?",
      kb: [["✅ Continue — Brickwork / blockwork", "wide tap"], ["🔁 Different task", ""], ["🔍 Browse all tasks", ""]], t: "4:42 PM" },
    { x: "<b>Brickwork / blockwork</b>\nToday, 27 Aug · now at <b>45%</b>\n\n<b>Progress?</b>\n<i>Tap a number, or type one.</i>",
      kb: [["50%","n"],["55%","n"],["60%","n"],["65%","n tap"],["70%","n"]], t: "4:43 PM" },
    { x: "<b>Brickwork / blockwork</b> — 65%",
      kb: [["+ Materials",""],["+ Labour","tap"],["+ Equipment",""],["+ Photo",""],["+ Note",""],["✅ Save","wide"]], t: "4:43 PM" },
    { x: "<b>Which role?</b>", kb: [["Mason","tap"],["Helper",""],["Bar Bender",""],["Electrician",""]], t: "4:44 PM" },
    { x: "<b>Mason</b>\n\nHow many workers?\n<i>Type a number.</i>", t: "4:44 PM" },
    { me: 1, x: "8", t: "4:44 PM" },
    { x: "<b>Brickwork / blockwork</b> — 65%\n👷 1 labour",
      kb: [["+ Materials",""],["+ Labour",""],["+ Equipment",""],["+ Photo",""],["+ Note",""],["✅ Save","wide tap"]], t: "4:45 PM" },
    { x: "✅ <b>Logged</b>\n\nBrickwork / blockwork — 65%\n👷 1 labour", ok: 1, t: "4:45 PM" },
  ],
};

const TA = {
  sub: "bot", tapNote: "தட்டப்பட்டது",
  msgs: [
    { me: 1, x: "/log", t: "மாலை 4:42" },
    { x: "<b>முன்னேற்றத்தைப் பதிவு செய்</b>\n<i>இன்று, 27 ஆக</i>\n\nஉங்கள் கடைசி பணியைத் தொடரவா?",
      kb: [["✅ தொடர் — செங்கல் வேலை", "wide tap"], ["🔁 வேறு பணி", ""], ["🔍 எல்லா பணிகளும்", ""]], t: "மாலை 4:42" },
    { x: "<b>செங்கல் வேலை</b>\nஇன்று, 27 ஆக · தற்போது <b>45%</b>\n\n<b>முன்னேற்றம்?</b>\n<i>ஒரு எண்ணைத் தட்டவும், அல்லது தட்டச்சு செய்யவும்.</i>",
      kb: [["50%","n"],["55%","n"],["60%","n"],["65%","n tap"],["70%","n"]], t: "மாலை 4:43" },
    { x: "<b>செங்கல் வேலை</b> — 65%",
      kb: [["+ பொருட்கள்",""],["+ தொழிலாளர்","tap"],["+ உபகரணம்",""],["+ புகைப்படம்",""],["+ குறிப்பு",""],["✅ சேமி","wide"]], t: "மாலை 4:43" },
    { x: "<b>எந்தப் பங்கு?</b>", kb: [["மேஸ்திரி","tap"],["ஹெல்பர்",""],["பார் பெண்டர்",""],["எலெக்ட்ரீஷியன்",""]], t: "மாலை 4:44" },
    { x: "<b>மேஸ்திரி</b>\n\nஎத்தனை தொழிலாளர்கள்?\n<i>ஒரு எண்ணைத் தட்டச்சு செய்யவும்.</i>", t: "மாலை 4:44" },
    { me: 1, x: "8", t: "மாலை 4:44" },
    { x: "<b>செங்கல் வேலை</b> — 65%\n👷 1 தொழிலாளர்",
      kb: [["+ பொருட்கள்",""],["+ தொழிலாளர்",""],["+ உபகரணம்",""],["+ புகைப்படம்",""],["+ குறிப்பு",""],["✅ சேமி","wide tap"]], t: "மாலை 4:45" },
    { x: "✅ <b>பதிவு செய்யப்பட்டது</b>\n\nசெங்கல் வேலை — 65%\n👷 1 தொழிலாளர்", ok: 1, t: "மாலை 4:45" },
  ],
};

function render(d) {
  const rows = d.msgs.map((m) => {
    if (m.me) return `<div class="row me"><div><div class="b">${m.x}</div><div class="t">${m.t}</div></div></div>`;
    const kb = m.kb ? `<div class="kb">${m.kb.map(([l, c]) => `<div class="k ${c}">${l}</div>`).join("")}</div>` : "";
    const cap = m.kb && m.kb.some(([, c]) => c.includes("tap")) ? `<div class="cap">▲ ${d.tapNote}</div>` : "";
    return `<div class="row"><div><div class="b bot ${m.ok ? "ok" : ""}">${m.x}${kb}</div>${cap}<div class="t">${m.t}</div></div></div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Noto+Sans+Tamil:wght@400;600;700;800&display=swap">
<style>${CSS}</style></head><body><div class="phone">
<div class="bar"><div class="av">S</div><div><div class="who">Sitetru</div><div class="sub">${d.sub}</div></div></div>
<div class="chat">${rows}</div></div></body></html>`;
}

writeFileSync(join(OUT, "en.html"), render(EN));
writeFileSync(join(OUT, "ta.html"), render(TA));
console.log("generated ->", OUT);
