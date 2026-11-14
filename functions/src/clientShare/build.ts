/**
 * What a client sees through a shared project link.
 *
 * Everything here is an ALLOW-list. The function receives the raw project
 * documents and copies across only the fields named below, so a field added to
 * a task, a daily log or an estimate later never reaches a client by accident.
 * Never included, whatever the sections say: costs, rates, vendor names,
 * purchase orders, stock, labour pay, materials, and the free-text notes site
 * engineers write in daily logs.
 *
 * Pure: no Firestore, no clock (today is passed in), so it is unit-tested.
 */

export interface ShareSections {
  progress: boolean;
  photos: boolean;
  updates: boolean;
  payments: boolean;
}

export interface ClientViewInput {
  sections: ShareSections;
  showHeadcount: boolean;
  today: string; // YYYY-MM-DD, India
  company: { name?: string; logo?: string; phone?: string; email?: string };
  project: any;
  tasks: any[];
  logs: any[];
  estimates: any[];
  payments: any[];
}

const s = (v: unknown, n = 120) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A date of any stored shape (ISO string, dd-mm-yyyy, Firestore Timestamp) as YYYY-MM-DD, or "". */
export function dayOf(v: any): string {
  if (!v) return "";
  if (typeof v === "object") {
    const secs = typeof v.seconds === "number" ? v.seconds : typeof v._seconds === "number" ? v._seconds : typeof v.toDate === "function" ? v.toDate().getTime() / 1000 : NaN;
    // Shown in India: a timestamp near midnight UTC is the next day there.
    return Number.isFinite(secs) ? new Date(secs * 1000 + 5.5 * 3600_000).toISOString().slice(0, 10) : "";
  }
  const t = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = Date.parse(t);
  return Number.isFinite(d) ? new Date(d + 5.5 * 3600_000).toISOString().slice(0, 10) : "";
}

const isHttps = (u: unknown) => typeof u === "string" && /^https:\/\//.test(u) && u.length < 2000;

export function buildClientView(input: ClientViewInput) {
  const { sections, today } = input;
  const p = input.project || {};
  const view: any = {
    company: {
      name: s(input.company.name, 80) || "Your builder",
      ...(typeof input.company.logo === "string" && input.company.logo.startsWith("data:image/") ? { logo: input.company.logo } : {}),
      ...(input.company.phone ? { phone: s(input.company.phone, 20) } : {}),
      ...(input.company.email ? { email: s(input.company.email, 120) } : {}),
    },
    project: {
      name: s(p.name, 120) || "Project",
      status: ["Planning", "Active", "On Hold", "Completed"].includes(p.status) ? p.status : "Active",
      startDate: dayOf(p.startDate),
      endDate: dayOf(p.endDate),
      ...(isHttps(p.imageUrl) ? { imageUrl: p.imageUrl } : {}),
    },
    sections: { ...sections },
    asOf: today,
  };

  const tasks = (input.tasks || []).filter((t) => t && s(t.name));
  const byId = new Map(tasks.map((t) => [String(t.id), t]));
  const parents = new Set(tasks.map((t) => String(t.parentId || "")).filter(Boolean));

  if (sections.progress) {
    // Overall progress: leaf tasks weighted by duration (a heading's progress
    // is already rolled up from its children, so counting it would double it).
    const leaves = tasks.filter((t) => !parents.has(String(t.id)) && t.type !== "Milestone");
    const weight = (t: any) => Math.max(1, num(t.duration) || 1);
    const totalW = leaves.reduce((n, t) => n + weight(t), 0);
    const overall = totalW ? Math.round(leaves.reduce((n, t) => n + weight(t) * Math.min(100, Math.max(0, num(t.progress))), 0) / totalW) : 0;
    const late = (t: any) => !!dayOf(t.endDate) && dayOf(t.endDate) < today && num(t.progress) < 100;
    // Phases: the top of the schedule. A flat schedule shows its tasks instead.
    const roots = tasks.filter((t) => !t.parentId || !byId.has(String(t.parentId)));
    const phases = roots
      .filter((t) => t.type !== "Milestone")
      .map((t) => ({
        name: s(t.name, 100),
        start: dayOf(t.startDate),
        end: dayOf(t.endDate),
        progress: Math.round(Math.min(100, Math.max(0, num(t.progress)))),
        late: late(t),
      }))
      .sort((a, b) => (a.start || "9") < (b.start || "9") ? -1 : 1)
      .slice(0, 40);
    const milestones = tasks
      .filter((t) => t.type === "Milestone")
      .map((t) => ({ name: s(t.name, 100), date: dayOf(t.endDate || t.startDate), done: num(t.progress) >= 100 || t.status === "Completed" }))
      .sort((a, b) => (a.date || "9") < (b.date || "9") ? -1 : 1)
      .slice(0, 30);
    const ends = tasks.map((t) => dayOf(t.endDate)).filter(Boolean).sort();
    view.progress = {
      overall,
      phases,
      milestones,
      lateCount: leaves.filter(late).length,
      expectedCompletion: dayOf(p.endDate) || ends[ends.length - 1] || "",
      tasksDone: leaves.filter((t) => num(t.progress) >= 100).length,
      tasksTotal: leaves.length,
    };
  }

  const logs = (input.logs || [])
    .map((l) => ({ l, day: dayOf(l?.workDate) || dayOf(l?.createdAt) }))
    .filter((x) => x.day && x.day <= today)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const taskName = (id: unknown) => s(byId.get(String(id))?.name, 100) || "Site work";

  if (sections.photos) {
    const photos: any[] = [];
    for (const { l, day } of logs) {
      for (const url of Array.isArray(l.photoUrls) ? l.photoUrls : []) {
        if (isHttps(url)) photos.push({ url, date: day, task: taskName(l.taskId) });
        if (photos.length >= 48) break;
      }
      if (photos.length >= 48) break;
    }
    view.photos = photos;
  }

  if (sections.updates) {
    view.updates = logs.slice(0, 40).map(({ l, day }) => ({
      date: day,
      task: taskName(l.taskId),
      progress: Math.round(Math.min(100, Math.max(0, num(l.progressPercent)))),
      ...(input.showHeadcount
        ? { workers: (Array.isArray(l.labour) ? l.labour : []).reduce((n: number, r: any) => n + Math.max(0, Math.floor(num(r?.headcount))), 0) }
        : {}),
      photos: (Array.isArray(l.photoUrls) ? l.photoUrls : []).filter(isHttps).length,
    }));
  }

  if (sections.payments) {
    // The agreed value is what the client has approved: approved estimates,
    // change orders included. Drafts and estimates still with the client are
    // not an agreement and are left out.
    const approved = (input.estimates || []).filter((e) => e?.status === "Approved");
    const contract = round2(approved.reduce((n, e) => n + num(e.totalAmount), 0));
    const received = (input.payments || [])
      .map((x) => ({ date: dayOf(x?.date), amount: round2(num(x?.amount)) }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const paid = round2(received.reduce((n, x) => n + x.amount, 0));
    view.payments = {
      contractValue: contract,
      approvedEstimates: approved.length,
      received: paid,
      balance: round2(Math.max(0, contract - paid)),
      history: received.slice(0, 50),
    };
  }

  return view;
}
