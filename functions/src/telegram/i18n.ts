/**
 * Telegram bot localisation. Mirrors the web app's i18n: English is the source
 * of truth and fallback; Tamil ("ta") is the parallel set. The active language
 * is stored per chat on the bot session (session.lang) and can be changed with
 * the /language command.
 */
export type BotLang = "en" | "ta";

export function normalizeLang(lang?: string | null): BotLang {
  return lang === "ta" ? "ta" : "en";
}

type Dict = Record<string, string>;

const en: Dict = {
  "sessionExpired": "Session expired. Send /link to reconnect.",
  "sendPhotoNow": "Send the photo now.",
  "typeNote": "Type your note.",
  "cancelled": "Cancelled.",
  "notLinkedShort": "You're not linked. Send /link to connect.",
  "notLinked":
    "You're not linked. Ask your admin for a link code, then send:\n<code>/link ABCD-EFGH</code>",
  "askLinkCode":
    "Ask your admin for a link code, then send:\n<code>/link ABCD-EFGH</code>",
  "tooManyAttempts":
    "Too many attempts. Please wait an hour and ask your admin for a fresh code.",
  "codeInvalid":
    "That code isn't valid. It may have expired or already been used. Ask your admin for a new one.",
  "linkedAs": "✅ Linked as <b>{email}</b>\n\nSend /help to see what I can do.",
  "unlinked": "Your Telegram account has been unlinked.",
  "notLinkedNow": "You are not currently linked.",
  "help":
    "<b>Sitetru Bot</b>\n\n" +
    "/plan — plan today's tasks (morning)\n" +
    "/log — log today's site progress\n" +
    "/today — see what's already logged today\n" +
    "/projects — switch active project\n" +
    "/language — change language (English / தமிழ்)\n" +
    "/cancel — cancel what you're doing\n" +
    "/help — this message",
  "noActiveProject": "No active project. Send /projects to pick one.",
  "noPlannableTasks": "No plannable tasks found for this project.",
  "enter0to100": "Enter a number between 0 and 100.",
  "enterQtyGt0": "Enter a quantity greater than 0.",
  "enterHeadcountGt0": "Enter a headcount greater than 0.",
  "didntUnderstand": "I didn't understand that. Send /help.",
  "unlinkedNotify": "Your Telegram account has been unlinked from Sitetru.",
  "endOfDayNoProject":
    "🌇 <b>End-of-day check-in</b>\n\nReply /projects to set your active project, then I'll help you log today's work.",
  // ---- Log flow (handlers/log.ts) ----
  "btnBrowseAll": "🔍 Browse all tasks",
  "btnCancel": "✖ Cancel",
  "btnBack": "◀ Back",
  "btnPrev": "◀ Prev",
  "btnNext": "Next ▶",
  "whatWorkedToday": "<b>What did you work on today?</b>",
  "pickTask": "<b>Pick a task</b>",
  "logProgressContinue":
    "<b>Log progress</b>\n<i>Today, {date}</i>\n\nContinue with your last task?",
  "btnContinueTask": "✅ Continue — {name}",
  "btnDifferentTask": "🔁 Different task",
  "taskGone": "That task no longer exists.",
  "progressPrompt":
    "<b>{name}</b>\nToday, {date} · now at <b>{current}%</b>\n\n<b>Progress?</b>\n<i>Tap a number, or type one.</i>",
  "btnSave": "✅ Save",
  "btnAddMaterials": "+ Materials",
  "btnAddLabour": "+ Labour",
  "btnAddEquipment": "+ Equipment",
  "btnAddPhoto": "+ Photo",
  "btnAddNote": "+ Note",
  "menuMaterials": "📦 {n} material(s)",
  "menuLabour": "👷 {n} labour",
  "menuEquipment": "🚜 {n} equipment",
  "menuPhotos": "📷 {n} photo(s)",
  "menuNote": "📝 {note}",
  "noInventory": "No inventory items found for this project.",
  "whichMaterial": "<b>Which material?</b>",
  "materialQtyPrompt":
    "<b>{name}</b>\n\nHow much was used? ({unit})\n<i>Type a number.</i>",
  "noLabourRoles": "No labour roles set up. Add them in the web app.",
  "whichRole": "<b>Which role?</b>",
  "headcountPrompt": "<b>{role}</b>\n\nHow many workers?\n<i>Type a number.</i>",
  "noEquipment": "No equipment set up. Add it in the web app.",
  "whichEquipment": "<b>Which equipment?</b>",
  "measuredIn": "<b>{name}</b>\n\nMeasured in?",
  "btnHours": "Hours",
  "btnDays": "Days",
  "equipmentQtyPrompt": "<b>{name}</b>\n\nHow many {unit}?\n<i>Type a number.</i>",
  "startLogBeforePhoto": "Start with /log before sending a photo.",
  "cantFetchPhoto": "Couldn't fetch that photo. Try again.",
  "cantDownloadPhoto": "Couldn't download that photo. Try again.",
  "loggedSummary": "✅ <b>Logged</b>\n\n{name} — {pct}%",
  "loggedMaterials": "\n📦 {n} material(s)",
  "loggedLabour": "\n👷 {n} labour",
  "todayNothing":
    "<b>Today · {date}</b>\n\nNothing logged yet. Send /log to add today's progress.",
  "todayHeader": "<b>Today · {date}</b>\n{n} update(s)\n",
  "todayBy": "by {name}",

  // ---- Projects (handlers/projects.ts) ----
  "noActiveProjects": "No active projects found.",
  "selectProject": "<b>Select an active project:</b>",
  "activeProjectSet": "✅ Active project set to: <b>{name}</b>",

  // ---- Agent (handlers/agent.ts) ----
  "agentNudge":
    "🌇 <b>End-of-day check-in</b>\n\n{n} task(s) still need today's update. Tap one to log it — pick from your lists, no typing except quantities.",
  "agentPlannedLegend": "\n\n⭐ = planned this morning.",
  "btnNotToday": "Not today",
  "planHeader":
    "🌅 <b>Good morning — plan today's work</b>\n\nTap the tasks you'll work on today, then <b>Save plan</b>.",
  "btnSavePlan": "💾 Save plan",
  "planNoTasks": "No tasks selected — plan not saved. Send /plan to try again.",
  "planSaved":
    "✅ <b>Today's plan saved</b> — {n} task(s):\n{list}\n\nI'll ask for the actuals at 5 PM.",

  // ---- Invoice (handlers/invoice.ts) ----
  "invSetProjectFirst":
    "Set your active project first with /projects, then resend the invoice photo.",
  "invReading": "📄 Reading the invoice…",
  "invReadFailed":
    "I couldn't read that invoice. Try a clearer, straight-on photo — or add it in the app.",
  "invSavedHeader": "📄 <b>Invoice read & saved as a draft</b>",
  "invVendor": "Vendor",
  "invInvoice": "Invoice",
  "invTotal": "Total (incl. GST)",
  "invPO": "PO",
  "invMatch": "Match",
  "invNotMatched": "— not matched —",
  "invReviewPost":
    "Review &amp; post it in the app → <b>Procurement → Bills</b>.",

  // Language switch
  "chooseLanguage": "🌐 Choose your language:",
  "languageSetEn": "✅ Language set to English.",
  "languageSetTa": "✅ மொழி தமிழுக்கு மாற்றப்பட்டது.",
  "langEnglish": "English",
  "langTamil": "தமிழ்",
};

const ta: Dict = {
  "sessionExpired": "அமர்வு காலாவதியானது. மீண்டும் இணைக்க /link அனுப்பவும்.",
  "sendPhotoNow": "இப்போது புகைப்படத்தை அனுப்பவும்.",
  "typeNote": "உங்கள் குறிப்பைத் தட்டச்சு செய்யவும்.",
  "cancelled": "ரத்து செய்யப்பட்டது.",
  "notLinkedShort": "நீங்கள் இணைக்கப்படவில்லை. இணைக்க /link அனுப்பவும்.",
  "notLinked":
    "நீங்கள் இணைக்கப்படவில்லை. உங்கள் நிர்வாகியிடம் இணைப்புக் குறியீட்டைக் கேட்டு, பின்னர் அனுப்பவும்:\n<code>/link ABCD-EFGH</code>",
  "askLinkCode":
    "உங்கள் நிர்வாகியிடம் இணைப்புக் குறியீட்டைக் கேட்டு, பின்னர் அனுப்பவும்:\n<code>/link ABCD-EFGH</code>",
  "tooManyAttempts":
    "அதிக முயற்சிகள். ஒரு மணி நேரம் காத்திருந்து, உங்கள் நிர்வாகியிடம் புதிய குறியீட்டைக் கேட்கவும்.",
  "codeInvalid":
    "அந்தக் குறியீடு செல்லுபடியாகாது. அது காலாவதியாகியிருக்கலாம் அல்லது ஏற்கனவே பயன்படுத்தப்பட்டிருக்கலாம். உங்கள் நிர்வாகியிடம் புதியதைக் கேட்கவும்.",
  "linkedAs":
    "✅ <b>{email}</b> ஆக இணைக்கப்பட்டது\n\nநான் என்ன செய்ய முடியும் என்பதைப் பார்க்க /help அனுப்பவும்.",
  "unlinked": "உங்கள் டெலிகிராம் கணக்கு இணைப்பு நீக்கப்பட்டது.",
  "notLinkedNow": "நீங்கள் தற்போது இணைக்கப்படவில்லை.",
  "help":
    "<b>Sitetru போட்</b>\n\n" +
    "/plan — இன்றைய பணிகளைத் திட்டமிடு (காலை)\n" +
    "/log — இன்றைய தள முன்னேற்றத்தைப் பதிவு செய்\n" +
    "/today — இன்று ஏற்கனவே பதிவு செய்ததைப் பார்\n" +
    "/projects — செயலில் உள்ள செயல்திட்டத்தை மாற்று\n" +
    "/language — மொழியை மாற்று (English / தமிழ்)\n" +
    "/cancel — நீங்கள் செய்வதை ரத்து செய்\n" +
    "/help — இந்தச் செய்தி",
  "noActiveProject":
    "செயலில் செயல்திட்டம் இல்லை. ஒன்றைத் தேர்ந்தெடுக்க /projects அனுப்பவும்.",
  "noPlannableTasks": "இந்த செயல்திட்டத்திற்கு திட்டமிடக்கூடிய பணிகள் இல்லை.",
  "enter0to100": "0 முதல் 100 வரை ஒரு எண்ணை உள்ளிடவும்.",
  "enterQtyGt0": "0 ஐ விட அதிகமான அளவை உள்ளிடவும்.",
  "enterHeadcountGt0": "0 ஐ விட அதிகமான தொழிலாளர் எண்ணிக்கையை உள்ளிடவும்.",
  "didntUnderstand": "எனக்கு அது புரியவில்லை. /help அனுப்பவும்.",
  "unlinkedNotify": "உங்கள் டெலிகிராம் கணக்கு Sitetru இலிருந்து இணைப்பு நீக்கப்பட்டது.",
  "endOfDayNoProject":
    "🌇 <b>நாள் இறுதி சரிபார்ப்பு</b>\n\nஉங்கள் செயலில் உள்ள செயல்திட்டத்தை அமைக்க /projects அனுப்பவும், பிறகு இன்றைய வேலையைப் பதிவு செய்ய உதவுகிறேன்.",
  // ---- Log flow (handlers/log.ts) ----
  "btnBrowseAll": "🔍 எல்லா பணிகளையும் பார்",
  "btnCancel": "✖ ரத்து",
  "btnBack": "◀ பின்",
  "btnPrev": "◀ முந்தைய",
  "btnNext": "அடுத்து ▶",
  "whatWorkedToday": "<b>இன்று எதில் வேலை செய்தீர்கள்?</b>",
  "pickTask": "<b>ஒரு பணியைத் தேர்ந்தெடுக்கவும்</b>",
  "logProgressContinue":
    "<b>முன்னேற்றத்தைப் பதிவு செய்</b>\n<i>இன்று, {date}</i>\n\nஉங்கள் கடைசி பணியைத் தொடரவா?",
  "btnContinueTask": "✅ தொடர் — {name}",
  "btnDifferentTask": "🔁 வேறு பணி",
  "taskGone": "அந்தப் பணி இப்போது இல்லை.",
  "progressPrompt":
    "<b>{name}</b>\nஇன்று, {date} · தற்போது <b>{current}%</b>\n\n<b>முன்னேற்றம்?</b>\n<i>ஒரு எண்ணைத் தட்டவும், அல்லது தட்டச்சு செய்யவும்.</i>",
  "btnSave": "✅ சேமி",
  "btnAddMaterials": "+ பொருட்கள்",
  "btnAddLabour": "+ தொழிலாளர்",
  "btnAddEquipment": "+ உபகரணம்",
  "btnAddPhoto": "+ புகைப்படம்",
  "btnAddNote": "+ குறிப்பு",
  "menuMaterials": "📦 {n} பொருட்கள்",
  "menuLabour": "👷 {n} தொழிலாளர்",
  "menuEquipment": "🚜 {n} உபகரணம்",
  "menuPhotos": "📷 {n} புகைப்படம்",
  "menuNote": "📝 {note}",
  "noInventory": "இந்த செயல்திட்டத்திற்கு ஸ்டாக் பொருட்கள் இல்லை.",
  "whichMaterial": "<b>எந்தப் பொருள்?</b>",
  "materialQtyPrompt":
    "<b>{name}</b>\n\nஎவ்வளவு பயன்படுத்தப்பட்டது? ({unit})\n<i>ஒரு எண்ணைத் தட்டச்சு செய்யவும்.</i>",
  "noLabourRoles": "தொழிலாளர் பங்குகள் அமைக்கப்படவில்லை. வலை பயன்பாட்டில் சேர்க்கவும்.",
  "whichRole": "<b>எந்தப் பங்கு?</b>",
  "headcountPrompt": "<b>{role}</b>\n\nஎத்தனை தொழிலாளர்கள்?\n<i>ஒரு எண்ணைத் தட்டச்சு செய்யவும்.</i>",
  "noEquipment": "உபகரணம் அமைக்கப்படவில்லை. வலை பயன்பாட்டில் சேர்க்கவும்.",
  "whichEquipment": "<b>எந்த உபகரணம்?</b>",
  "measuredIn": "<b>{name}</b>\n\nஎதில் அளக்கப்படுகிறது?",
  "btnHours": "மணிநேரம்",
  "btnDays": "நாட்கள்",
  "equipmentQtyPrompt": "<b>{name}</b>\n\nஎத்தனை {unit}?\n<i>ஒரு எண்ணைத் தட்டச்சு செய்யவும்.</i>",
  "startLogBeforePhoto": "புகைப்படம் அனுப்பும் முன் /log உடன் தொடங்கவும்.",
  "cantFetchPhoto": "அந்தப் புகைப்படத்தைப் பெற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
  "cantDownloadPhoto": "அந்தப் புகைப்படத்தைப் பதிவிறக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
  "loggedSummary": "✅ <b>பதிவு செய்யப்பட்டது</b>\n\n{name} — {pct}%",
  "loggedMaterials": "\n📦 {n} பொருட்கள்",
  "loggedLabour": "\n👷 {n} தொழிலாளர்",
  "todayNothing":
    "<b>இன்று · {date}</b>\n\nஇன்னும் எதுவும் பதிவு செய்யப்படவில்லை. இன்றைய முன்னேற்றத்தைச் சேர்க்க /log அனுப்பவும்.",
  "todayHeader": "<b>இன்று · {date}</b>\n{n} புதுப்பிப்புகள்\n",
  "todayBy": "{name} மூலம்",

  // ---- Projects (handlers/projects.ts) ----
  "noActiveProjects": "செயலில் உள்ள செயல்திட்டங்கள் எதுவும் இல்லை.",
  "selectProject": "<b>செயலில் உள்ள செயல்திட்டத்தைத் தேர்ந்தெடுக்கவும்:</b>",
  "activeProjectSet": "✅ செயலில் உள்ள செயல்திட்டம் அமைக்கப்பட்டது: <b>{name}</b>",

  // ---- Agent (handlers/agent.ts) ----
  "agentNudge":
    "🌇 <b>நாள் இறுதி சரிபார்ப்பு</b>\n\n{n} பணிகளுக்கு இன்னும் இன்றைய புதுப்பிப்பு தேவை. ஒன்றைத் தட்டி பதிவு செய்யுங்கள் — உங்கள் பட்டியலிலிருந்து தேர்ந்தெடுக்கவும், அளவுகள் தவிர தட்டச்சு தேவையில்லை.",
  "agentPlannedLegend": "\n\n⭐ = காலையில் திட்டமிடப்பட்டது.",
  "btnNotToday": "இன்று இல்லை",
  "planHeader":
    "🌅 <b>காலை வணக்கம் — இன்றைய வேலையைத் திட்டமிடுங்கள்</b>\n\nஇன்று நீங்கள் வேலை செய்யும் பணிகளைத் தட்டி, பின்னர் <b>திட்டத்தைச் சேமி</b>.",
  "btnSavePlan": "💾 திட்டத்தைச் சேமி",
  "planNoTasks": "பணிகள் எதுவும் தேர்ந்தெடுக்கப்படவில்லை — திட்டம் சேமிக்கப்படவில்லை. மீண்டும் முயற்சிக்க /plan அனுப்பவும்.",
  "planSaved":
    "✅ <b>இன்றைய திட்டம் சேமிக்கப்பட்டது</b> — {n} பணிகள்:\n{list}\n\nமாலை 5 மணிக்கு நிஜ தரவைக் கேட்பேன்.",

  // ---- Invoice (handlers/invoice.ts) ----
  "invSetProjectFirst":
    "முதலில் /projects மூலம் உங்கள் செயலில் உள்ள செயல்திட்டத்தை அமைத்து, பின்னர் விலைப்பட்டியல் புகைப்படத்தை மீண்டும் அனுப்பவும்.",
  "invReading": "📄 விலைப்பட்டியலைப் படிக்கிறது…",
  "invReadFailed":
    "அந்த விலைப்பட்டியலைப் படிக்க முடியவில்லை. தெளிவான, நேரான புகைப்படத்தை முயற்சிக்கவும் — அல்லது பயன்பாட்டில் சேர்க்கவும்.",
  "invSavedHeader": "📄 <b>விலைப்பட்டியல் படித்து வரைவாகச் சேமிக்கப்பட்டது</b>",
  "invVendor": "சப்ளையர்",
  "invInvoice": "விலைப்பட்டியல்",
  "invTotal": "மொத்தம் (GST உட்பட)",
  "invPO": "கொள்முதல் ஆணை",
  "invMatch": "பொருத்தம்",
  "invNotMatched": "— பொருத்தப்படவில்லை —",
  "invReviewPost":
    "பயன்பாட்டில் மதிப்பாய்வு செய்து பதிவு செய்யவும் → <b>கொள்முதல் → பில்கள்</b>.",

  // Language switch
  "chooseLanguage": "🌐 உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்:",
  "languageSetEn": "✅ Language set to English.",
  "languageSetTa": "✅ மொழி தமிழுக்கு மாற்றப்பட்டது.",
  "langEnglish": "English",
  "langTamil": "தமிழ்",
};

const dicts: Record<BotLang, Dict> = { en, ta };

/** Translate a bot string key for the given language, with {param} interpolation. */
export function tt(
  lang: BotLang | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  const l = normalizeLang(lang);
  let v = dicts[l][key];
  if (v === undefined) v = en[key];
  if (v === undefined) return key;
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      v = v.replace(new RegExp(`\\{${k}\\}`, "g"), String(val));
    }
  }
  return v;
}
