import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const SCREENS = join(HERE, "screens");
const IMG = {
  wbs:  join(SCREENS, "m-03-wbs.png"),
  logs: join(SCREENS, "m-04-daily-logs.png"),
  proc: join(SCREENS, "m-07-procurement.png"),
  cost: join(SCREENS, "m-09-cost-management.png"),
  est:  join(SCREENS, "m-10-client-estimates.png"),
  dash: join(SCREENS, "m-01-dashboard.png"),
};
const OUT = process.env.OUT_DIR || join(HERE, "out");
mkdirSync(OUT, { recursive: true });

// Regions of interest, in source pixels (images are 3200x2000).
// Height is derived from the window aspect so nothing is ever distorted.
// Each beat pans from `a` to `b` — this is the "crop into the panel" move.
const BEATS_EN = [
  { img: "wbs",  a: [740, 880, 1350], b: [1830, 880, 1350],
    h: "Plan it once", s: "Break the job the way you'd write it on paper — foundation, ground floor, first floor. Days and budget go in once.", tag: "WBS" },
  { img: "logs", a: [760, 330, 1560], b: [1640, 330, 1560],
    h: "The site reports to you", s: "Progress, headcount, material — sent from site. Over Telegram if that's easier. Nobody learns a new app.", tag: "DAILY LOGS", badge: "65% · 22 workers today" },
  { img: "proc", a: [720, 588, 1350], b: [1810, 588, 1350],
    h: "Buy material", s: "Raise a purchase order. Receive it when it lands. Stock and the supplier's account move on their own.", tag: "PROCUREMENT" },
  { img: "cost", a: [720, 372, 1350], b: [1830, 372, 1350],
    h: "Watch the money", s: "Planned against actual, task by task. Overspend shows up today — not at month end.", tag: "COST", badge: "₹53.7L spent of ₹1.08Cr" },
  { img: "est",  a: [720, 428, 1350], b: [1810, 428, 1350],
    h: "Bill the client", s: "Estimate from the same breakdown you already built. Variations tracked separately. GST added, clean.", tag: "CLIENT ESTIMATES" },
  { img: "dash", a: [720, 560, 1350], b: [720, 1020, 1350],
    h: "See it all", s: "How much is built, how much is spent, what is at risk. Log once — the rest updates itself.", tag: "DASHBOARD", badge: "43% built · 50% of budget" },
];

// Tamil: headline = the script's "On screen" line, body = the narration line
// VERBATIM from tamil-narration.txt. No audio track is possible here, so the
// narration is carried as on-screen text instead of voice.
const BEATS_TA = [
  { img: "wbs",  a: [740, 880, 1350], b: [1830, 880, 1350], tag: "WBS",
    h: "ஒரு தடவை போடுங்க",
    s: "மதுரை ஒத்தக்கடையில ஒரு G+2 வீடு. வேலையை காகிதத்துல எழுதுற மாதிரியே பிரிச்சு வையுங்க — அஸ்திவாரம், தரை தளம், முதல் தளம். ஒவ்வொரு பணிக்கும் நாளும் பட்ஜெட்டும் ஒரு தடவை போட்டா போதும்." },
  { img: "logs", a: [760, 330, 1560], b: [1640, 330, 1560], tag: "DAILY LOGS",
    h: "டெலிகிராம்ல அனுப்பினா போதும்",
    s: "சைட்ல இருந்து இன்ஜினியர் அனுப்புற தினசரி அப்டேட் — எவ்ளோ முன்னேற்றம், எத்தனை ஆள், என்ன பொருள் — நேரா இங்க வந்து சேரும். டெலிகிராம்ல அனுப்பினாலும் வரும். புது ஆப் கத்துக்க வேணாம்." },
  { img: "proc", a: [720, 588, 1350], b: [1810, 588, 1350], tag: "PROCUREMENT",
    h: "பர்ச்சேஸ் ஆர்டர் போடுங்க",
    s: "பர்ச்சேஸ் ஆர்டர் போடுங்க. பொருள் வந்ததும் ரிசீவ் பண்ணுங்க. ஸ்டாக்கும் சப்ளையர் கணக்கும் தானா நகரும். விலை முன்னாடி விட ஏறியிருந்தா, ஆர்டர் போடும்போதே சிவப்புல தெரியும்." },
  { img: "cost", a: [720, 372, 1350], b: [1830, 372, 1350], tag: "COST",
    h: "43% முடிஞ்சது · ₹53.7L செலவு",
    s: "ஒவ்வொரு பணிக்கும் பட்ஜெட் எவ்ளோ, உண்மையான செலவு எவ்ளோ — நேரடியா. பட்ஜெட்டைத் தாண்டினா, இப்பவே தெரியும். அடுத்த மாசம் இல்ல." },
  { img: "est",  a: [720, 428, 1350], b: [1810, 428, 1350], tag: "CLIENT ESTIMATES",
    h: "எஸ்டிமேட் · மாற்ற ஆணை",
    s: "அதே பிரிவுலயே இருந்து வாடிக்கையாளருக்கு எஸ்டிமேட். மாற்றங்கள் தனியா பதிவாகும். GST சேர்த்து, சுத்தமா." },
  { img: "dash", a: [720, 560, 1350], b: [720, 1020, 1350], tag: "DASHBOARD",
    h: "ஒரே இடத்துல",
    s: "ஒரே இடத்துல — எவ்ளோ கட்டி முடிஞ்சது, எவ்ளோ காசு போச்சு, எது ரிஸ்க்ல இருக்கு. ஒரு தடவை பதிவு செய்யுங்க, மீதி எல்லாம் தானா அப்டேட் ஆகும்." },
];

const COPY_EN = {
  introK: "How many calls?", introS: "How many registers?",
  introSub: "To find out what happened on your site today.",
  outroH: "Sitetru", outroTag: "truth, reported from site.",
  outroL: ["Free plan to start", "From ₹999 / month", "14-day trial — no card"],
  url: "sitetru.com",
};
const COPY_TA = {
  introK: "எத்தனை கால்?", introS: "எத்தனை ரிஜிஸ்டர்?",
  introSub: "உங்க சைட்ல இன்னிக்கு என்ன நடந்ததுன்னு தெரிஞ்சுக்க.",
  outroH: "Sitetru", outroTag: "தளத்திலிருந்து வரும் உண்மை",
  outroL: ["இலவசமா ஆரம்பிங்க", "₹999/மாதம் முதல்", "14 நாள் ட்ரையல் — கார்டு வேணாம்"],
  url: "sitetru.com",
};

function html(v) {
  const vertical = v.W < v.H;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Noto+Sans+Tamil:wght@400;500;600;700;800&display=swap">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${v.W}px;height:${v.H}px;overflow:hidden;background:#22333F}
body{font-family:Manrope,'Noto Sans Tamil',sans-serif;-webkit-font-smoothing:antialiased}
#stage{position:relative;width:${v.W}px;height:${v.H}px;background:
  radial-gradient(1200px 800px at 50% -10%, #3A5262 0%, #22333F 55%, #1B2A34 100%)}
.grain{position:absolute;inset:0;opacity:.05;background-image:radial-gradient(#fff 1px,transparent 1px);background-size:5px 5px}
.scene{position:absolute;inset:0;opacity:0}
/* --- screen window --- */
.win{position:absolute;overflow:hidden;border-radius:${v.win.r}px;background:#fff;
  box-shadow:0 40px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.10)}
.win img{position:absolute;transform-origin:0 0;image-rendering:auto}
.winglow{position:absolute;border-radius:26px;box-shadow:0 0 0 3px rgba(217,125,84,.55);pointer-events:none}
/* --- text --- */
.tag{color:#D97D54;font-weight:800;letter-spacing:.20em;font-size:${v.tag}px;text-transform:uppercase}
.h{color:#F0F3F4;font-weight:800;font-size:${v.h}px;line-height:1.1;letter-spacing:-.015em}
.s{color:#B7C6CE;font-weight:500;font-size:${v.s}px;line-height:1.5}
.badge{display:inline-block;background:rgba(135,188,191,.16);border:2px solid #87BCBF;color:#CFE6E7;
  font-weight:800;font-size:${v.badge}px;padding:${v.badgeP}px ${v.badgeP*1.7}px;border-radius:999px}
/* --- intro / outro --- */
.big{color:#F0F3F4;font-weight:800;font-size:${v.big}px;line-height:1.06;letter-spacing:-.02em}
.big em{font-style:normal;color:#D97D54}
.dots{position:absolute;display:flex;gap:10px}
.dot{width:${v.dot}px;height:${v.dot}px;border-radius:99px;background:rgba(240,243,244,.22)}
.dot.on{background:#D97D54;width:${v.dot*3.2}px}
.url{color:#87BCBF;font-weight:700;font-size:${v.url}px;letter-spacing:.04em}
.mark{display:flex;align-items:center;gap:${v.markG}px}
.markbox{width:${v.markS}px;height:${v.markS}px;border-radius:${v.markS*0.26}px;background:#D97D54;
  display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${v.markS*0.55}px}
.markw{color:#F0F3F4;font-weight:800;font-size:${v.markS*0.62}px;letter-spacing:-.01em}
.pill{display:inline-block;border:2px solid rgba(240,243,244,.28);color:#E4EBEE;border-radius:999px;
  font-weight:700;font-size:${v.pill}px;padding:${v.pillP}px ${v.pillP*1.9}px}
</style></head><body>
<div id="stage"><div class="grain"></div></div>
<script>
const V = ${JSON.stringify(v)};
const BEATS = ${JSON.stringify(v.beats)};
const C = ${JSON.stringify(v.copy)};
const IMGSRC = ${JSON.stringify(v.imgsrc)};
const stage = document.getElementById("stage");
const vertical = V.W < V.H;
const easeIO = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
const easeOut = t => 1-Math.pow(1-t,3);
const cl = (a,b,t)=>a+(b-a)*Math.max(0,Math.min(1,t));

// ---------- build scenes ----------
function el(cls, css, html){ const d=document.createElement("div"); d.className=cls||"";
  if(css) Object.assign(d.style, css); if(html!=null) d.innerHTML=html; return d; }

// intro
const intro = el("scene");
{
  const wrap = el("", {position:"absolute", left:V.pad+"px", right:V.pad+"px",
    top:"50%", transform:"translateY(-50%)", textAlign: vertical?"center":"left"});
  const m = el("mark",{marginBottom:V.pad*0.7+"px",
    justifyContent: vertical?"center":"flex-start"});
  m.appendChild(el("markbox",{},"S")); m.appendChild(el("markw",{},"Sitetru"));
  wrap.appendChild(m);
  const b = el("big",{}, C.introK+"<br><em>"+C.introS+"</em>");
  b.id="introBig"; wrap.appendChild(b);
  const s = el("s",{marginTop:V.pad*0.6+"px", maxWidth:V.textW+"px",
    marginLeft: vertical?"auto":"0", marginRight: vertical?"auto":"0"}, C.introSub);
  s.id="introSub"; wrap.appendChild(s);
  intro.appendChild(wrap);
}
stage.appendChild(intro);

// beats
const beatEls = BEATS.map((B,i)=>{
  const sc = el("scene");
  const win = el("win",{left:V.win.x+"px", top:V.win.y+"px", width:V.win.w+"px", height:V.win.h+"px"});
  const img = document.createElement("img"); img.src = IMGSRC[B.img]; win.appendChild(img);
  sc.appendChild(win);
  if (V.win.r > 0){
    const glow = el("winglow",{left:(V.win.x-3)+"px", top:(V.win.y-3)+"px",
      width:(V.win.w+6)+"px", height:(V.win.h+6)+"px"});
    sc.appendChild(glow);
  }

  const tx = el("", {position:"absolute", left:V.text.x+"px", top:V.text.y+"px", width:V.text.w+"px"});
  const tag = el("tag",{}, B.tag); tx.appendChild(tag);
  const h = el("h",{marginTop:V.pad*0.30+"px"}, B.h); tx.appendChild(h);
  const s = el("s",{marginTop:V.pad*0.42+"px"}, B.s); tx.appendChild(s);
  let badge=null;
  if(B.badge){ const bw=el("",{marginTop:V.pad*0.5+"px"});
    badge=el("badge",{},B.badge); bw.appendChild(badge); tx.appendChild(bw); }
  sc.appendChild(tx);
  stage.appendChild(sc);
  return {sc, img, tag, h, s, badge, B};
});

// footer (mark + url), visible through the beats
const footer = el("",{position:"absolute", left:V.dots.x+"px", top:V.foot+"px",
  display:"flex", alignItems:"center", gap:V.markG+"px", opacity:0});
{ const m = el("mark",{});
  m.appendChild(el("markbox",{width:(V.markS*0.72)+"px",height:(V.markS*0.72)+"px",
    borderRadius:(V.markS*0.19)+"px",fontSize:(V.markS*0.40)+"px"},"S"));
  m.appendChild(el("markw",{fontSize:(V.markS*0.46)+"px"},"Sitetru"));
  footer.appendChild(m);
  footer.appendChild(el("url",{fontSize:(V.url*0.78)+"px",opacity:.75}, "\u00b7 " + C.url));
}
stage.appendChild(footer);

// dots
const dots = el("dots",{left:V.dots.x+"px", top:V.dots.y+"px"});
const dotEls = BEATS.map(()=>{ const d=el("dot"); dots.appendChild(d); return d; });
stage.appendChild(dots);

// outro
const outro = el("scene");
{
  const wrap = el("",{position:"absolute", left:V.pad+"px", right:V.pad+"px",
    top:"50%", transform:"translateY(-50%)", textAlign: vertical?"center":"left"});
  const m = el("mark",{marginBottom:V.pad*0.55+"px",
    justifyContent: vertical?"center":"flex-start"});
  m.appendChild(el("markbox",{},"S")); m.appendChild(el("markw",{},"Sitetru"));
  wrap.appendChild(m);
  const tagline = el("big",{fontSize:(V.big*(vertical?0.70:0.52))+"px", color:"#D97D54"}, C.outroTag);
  tagline.id="outroTag"; wrap.appendChild(tagline);
  const list = el("",{marginTop:V.pad*0.75+"px", display:"flex", flexWrap:"wrap",
    gap:V.pad*0.28+"px", justifyContent: vertical?"center":"flex-start"});
  C.outroL.forEach(t=> list.appendChild(el("pill",{},t)));
  list.id="outroList"; wrap.appendChild(list);
  const u = el("url",{marginTop:V.pad*0.75+"px"}, C.url); u.id="outroUrl"; wrap.appendChild(u);
  outro.appendChild(wrap);
}
stage.appendChild(outro);

// ---------- timeline ----------
const T_IN = V.tIntro, T_B = V.tBeat, T_OUT = V.tOutro;
const TOTAL = T_IN + T_B*BEATS.length + T_OUT;
window.TOTAL = TOTAL;

function setROI(img, roi){
  const scale = V.win.w / roi[2];
  img.style.width = (3200*scale)+"px";
  img.style.height = (2000*scale)+"px";
  img.style.left = (-roi[0]*scale)+"px";
  img.style.top  = (-roi[1]*scale)+"px";
}
const aspect = V.win.w / V.win.h;
function roiAt(B, p){
  const rs = V.roiScale || 1, ps = V.panScale != null ? V.panScale : 1;
  const w = cl(B.a[2], B.b[2], p) * rs;
  let   x = B.a[0] + (B.b[0] - B.a[0]) * p * ps;
  let   y = B.a[1] + (B.b[1] - B.a[1]) * p * ps;
  const h = w / aspect;
  if (x + w > 3200) x = 3200 - w;
  if (x < 0) x = 0;
  if (y + h > 2000) y = 2000 - h;
  if (y < 0) y = 0;
  return [x, y, w];
}

window.render = function(t){
  intro.style.opacity = 0; outro.style.opacity = 0;
  beatEls.forEach(b=> b.sc.style.opacity = 0);
  dots.style.opacity = 0; footer.style.opacity = 0;

  if (t < T_IN){
    const p = t / T_IN;
    intro.style.opacity = Math.min(1, easeOut(p*3)) * (p>0.90 ? (1-(p-0.90)/0.10) : 1);
    const k = easeOut(Math.min(1,p*2.2));
    document.getElementById("introBig").style.transform = "translateY("+(1-k)*V.rise+"px)";
    document.getElementById("introSub").style.opacity = easeOut(Math.max(0,Math.min(1,(p-0.30)*3)));
    return;
  }
  const tb = t - T_IN;
  if (tb < T_B*BEATS.length){
    const i = Math.min(BEATS.length-1, Math.floor(tb / T_B));
    const p = (tb - i*T_B) / T_B;          // 0..1 within beat
    const b = beatEls[i];
    // fade in fast, hold, fade out at the very end
    let op = 1;
    if (p < 0.06) op = easeOut(p/0.06);
    if (p > 0.94) op = 1 - easeOut((p-0.94)/0.06);
    b.sc.style.opacity = op;
    dots.style.opacity = op; footer.style.opacity = op*0.9;
    dotEls.forEach((d,j)=> d.className = "dot" + (j===i ? " on":""));
    // Ken Burns across the panel
    setROI(b.img, roiAt(b.B, easeIO(Math.max(0,Math.min(1,(p-0.10)/0.80)))));
    // text stagger
    const rise = (k)=> "translateY("+(1-k)*V.rise+"px)";
    const k1 = easeOut(Math.max(0,Math.min(1,(p-0.02)/0.14)));
    const k2 = easeOut(Math.max(0,Math.min(1,(p-0.07)/0.16)));
    const k3 = easeOut(Math.max(0,Math.min(1,(p-0.13)/0.18)));
    b.tag.style.opacity=k1; b.tag.style.transform=rise(k1);
    b.h.style.opacity=k2;   b.h.style.transform=rise(k2);
    b.s.style.opacity=k3;   b.s.style.transform=rise(k3);
    if (b.badge){ const k4 = easeOut(Math.max(0,Math.min(1,(p-0.22)/0.18)));
      b.badge.style.opacity=k4; b.badge.style.transform="scale("+(0.90+0.10*k4)+")"; }
    return;
  }
  const p = Math.min(1,(tb - T_B*BEATS.length) / T_OUT);
  outro.style.opacity = Math.min(1, easeOut(p*4));
  const k = easeOut(Math.min(1,p*2));
  document.getElementById("outroTag").style.transform = "translateY("+(1-k)*V.rise+"px)";
  document.getElementById("outroList").style.opacity = easeOut(Math.max(0,Math.min(1,(p-0.18)*3)));
  document.getElementById("outroUrl").style.opacity  = easeOut(Math.max(0,Math.min(1,(p-0.34)*3)));
};
window.ready = (async()=>{ await document.fonts.ready;
  await Promise.all([...document.images].map(i=> i.complete?1:new Promise(r=>{i.onload=r;i.onerror=r;})));
  window.render(0); return true; })();
</script></body></html>`;
}

// ---------------- variants ----------------
const imgsrc = Object.fromEntries(Object.entries(IMG).map(([k,p])=>[k,"file://"+p]));

const VERT = {
  name:"sitetru-vertical-en", W:1080, H:1920, fps:24,
  tIntro:4.0, tBeat:11.0, tOutro:6.5,
  win:{x:0,y:225,w:1080,h:780,r:0}, text:{x:60,y:1085,w:960},
  dots:{x:60,y:1800}, foot:1660, pad:60, textW:900, rise:26,
  tag:26, h:78, s:34, badge:32, badgeP:16, big:104, dot:12, url:34,
  markS:64, markG:18, pill:28, pillP:14,
  roiScale:1.0, panScale:1.0,
  beats:BEATS_EN, copy:COPY_EN, imgsrc,
};
const WIDE_TA = {
  name:"sitetru-tamil-16x9", W:1920, H:1080, fps:24,
  tIntro:4.5, tBeat:13.0, tOutro:7.0,
  win:{x:860,y:179,w:1000,h:722,r:18}, text:{x:96,y:205,w:700},
  dots:{x:96,y:940}, foot:855, pad:96, textW:760, rise:24,
  tag:22, h:60, s:29, badge:28, badgeP:14, big:86, dot:11, url:30,
  markS:58, markG:16, pill:24, pillP:12,
  roiScale:1.25, panScale:0.55,
  beats:BEATS_TA, copy:COPY_TA, imgsrc,
};

const which = process.argv[2] || "both";
const variants = which==="vert" ? [VERT] : which==="ta" ? [WIDE_TA] : [VERT, WIDE_TA];

const browser = await chromium.launch({
  executablePath: CHROME,
  args:["--no-sandbox","--disable-lcd-text","--force-device-scale-factor=1"],
});

for (const v of variants){
  const file = join(OUT, `${v.name}.html`);
  writeFileSync(file, html(v));
  const dir = join(OUT, ".frames", v.name);
  rmSync(dir,{recursive:true,force:true}); mkdirSync(dir,{recursive:true});

  const page = await browser.newPage({ viewport:{width:v.W,height:v.H}, deviceScaleFactor:1 });
  await page.goto("file://"+file, { waitUntil:"load" });
  await page.evaluate(()=>window.ready);
  await page.waitForTimeout(600);
  const total = await page.evaluate(()=>window.TOTAL);
  const frames = Math.round(total * v.fps);
  console.log(`\n${v.name}: ${total.toFixed(1)}s -> ${frames} frames @ ${v.fps}fps`);

  if (process.env.PREVIEW){
    const marks = [v.tIntro+v.tBeat*1+1.6, v.tIntro+v.tBeat*2-0.8, v.tIntro+v.tBeat*0+1.6, v.tIntro+v.tBeat*1-0.8, v.tIntro+v.tBeat*6-0.8, total-2.0];
    for (let j=0;j<marks.length;j++){
      await page.evaluate(t=>window.render(t), marks[j]);
      await page.screenshot({ path: join(OUT, `prev-${v.name}-${j}.png`) });
    }
    console.log("  previews written");
    await page.close();
    continue;
  }
  const t0 = Date.now();
  for (let i=0;i<frames;i++){
    await page.evaluate(t=>window.render(t), i/v.fps);
    await page.screenshot({ path:`${dir}/f${String(i).padStart(5,"0")}.jpg`, type:"jpeg", quality:88 });
    if (i%200===0 && i) process.stdout.write(`  ${i}/${frames} (${((Date.now()-t0)/1000).toFixed(0)}s)\n`);
  }
  await page.close();

  const out = join(OUT, `${v.name}.mp4`);
  execSync(`ffmpeg -v error -y -framerate ${v.fps} -i ${dir}/f%05d.jpg `+
    `-c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -movflags +faststart `+
    `-vf "scale=${v.W}:${v.H}:flags=lanczos" ${out}`, {stdio:"inherit"});
  rmSync(dir,{recursive:true,force:true});
  console.log(`  -> ${out}`);
}
await browser.close();
console.log("\ndone");
