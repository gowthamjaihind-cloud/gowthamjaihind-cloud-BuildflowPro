/**
 * Posts approved Instagram posts when they are due, and records the week's
 * numbers. Run by .github/workflows/social.yml; nothing here runs on its own.
 *
 *   node marketing/social/publish.mjs publish [--dry-run]   post what is due
 *   node marketing/social/publish.mjs approve <week> <all|1,3,4>
 *   node marketing/social/publish.mjs insights              update performance.md
 *
 * What gets posted is marketing/social/weeks/<week>/schedule.json on main. A
 * post goes out only when its status is "approved" and its time has come.
 * Approving is the founder's step (the "Approve social posts" workflow, or by
 * editing the file); the weekly drafting session only ever writes "draft".
 *
 * Instagram's publishing API takes media by public URL, so each file is put in
 * the project's bucket under social/ and handed over as a short-lived signed
 * URL. Needs, as GitHub secrets: IG_USER_ID, IG_ACCESS_TOKEN (a long-lived
 * token with instagram_content_publish), and the existing FIREBASE_SERVICE_ACCOUNT.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
export const WEEKS = join(HERE, "weeks");

// ---------------------------------------------------------------------------
// Schedules

/** Every week's schedule, oldest first: { week, file, posts }. */
export function loadSchedules(dir = WEEKS) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((w) => existsSync(join(dir, w, "schedule.json")))
    .sort()
    .map((week) => {
      const file = join(dir, week, "schedule.json");
      return { week, file, posts: JSON.parse(readFileSync(file, "utf8")) };
    });
}

export const saveSchedule = (s) => writeFileSync(s.file, JSON.stringify(s.posts, null, 2) + "\n");

/** Approved, not yet posted, and due (but not more than `lateHours` late: a
 *  post that missed its evening by a day is better rescheduled by a person). */
export function duePosts(schedules, now = new Date(), lateHours = 12) {
  const out = [];
  for (const s of schedules) {
    for (const p of s.posts) {
      if (p.status !== "approved") continue;
      const at = new Date(p.at);
      if (Number.isNaN(at.getTime())) continue;
      const late = (now - at) / 3.6e6;
      if (late >= 0 && late <= lateHours) out.push({ schedule: s, post: p });
    }
  }
  return out.sort((a, b) => new Date(a.post.at) - new Date(b.post.at));
}

export function captionOf(p) {
  const tags = (p.hashtags || []).map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const text = [p.caption?.trim(), tags].filter(Boolean).join("\n\n");
  if (text.length > 2200) throw new Error(`${p.id}: caption is ${text.length} characters (Instagram allows 2,200)`);
  if ((p.hashtags || []).length > 30) throw new Error(`${p.id}: more than 30 hashtags`);
  return text;
}

/** Problems that would stop a post going out, found before anything is uploaded. */
export function checkPost(p, weekDir) {
  const problems = [];
  if (!["reel", "carousel", "image"].includes(p.type)) problems.push(`unknown type ${p.type}`);
  const media = p.media || [];
  if (!media.length) problems.push("no media");
  if (p.type === "carousel" && (media.length < 2 || media.length > 10)) problems.push("a carousel needs 2 to 10 files");
  if (p.type !== "carousel" && media.length > 1) problems.push(`a ${p.type} takes one file`);
  for (const m of media) {
    if (!existsSync(join(weekDir, m))) problems.push(`missing ${m}`);
    const video = /\.mp4$/i.test(m);
    if (p.type === "reel" && !video) problems.push(`${m}: a reel must be .mp4`);
    if (p.type !== "reel" && !/\.(jpe?g|png|mp4)$/i.test(m)) problems.push(`${m}: unsupported file`);
  }
  try { captionOf(p); } catch (e) { problems.push(e.message); }
  return problems;
}

/** Set posts in a week to approved: "all" or "1,3,4" (post numbers or ids). */
export function approve(schedule, which) {
  const pick = which === "all" ? null : new Set(String(which).split(",").map((x) => x.trim()));
  const changed = [];
  schedule.posts.forEach((p, i) => {
    if (p.status !== "draft") return;
    if (pick && !pick.has(String(i + 1)) && !pick.has(p.id)) return;
    p.status = "approved";
    changed.push(p.id);
  });
  return changed;
}

// ---------------------------------------------------------------------------
// Instagram Graph API

export function graph({ token, version = "v23.0", host = "https://graph.facebook.com", fetchImpl = fetch }) {
  const call = async (method, path, params = {}) => {
    const url = new URL(`${host}/${version}/${path}`);
    const body = new URLSearchParams({ ...params, access_token: token });
    const res = method === "GET"
      ? await fetchImpl(`${url}?${body}`)
      : await fetchImpl(url, { method, body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      // Never echo the token: the error object does not contain it, the URL does.
      throw new Error(`Instagram ${method} ${path}: ${json.error?.message || res.status}`);
    }
    return json;
  };
  return { get: (p, q) => call("GET", p, q), post: (p, q) => call("POST", p, q) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for an uploaded container to be processed (videos take a while). */
async function ready(api, id, { tries = 40, every = 15000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const { status_code: s } = await api.get(id, { fields: "status_code" });
    if (s === "FINISHED") return;
    if (s === "ERROR" || s === "EXPIRED") throw new Error(`container ${id}: ${s}`);
    await sleep(every);
  }
  throw new Error(`container ${id}: still processing`);
}

/**
 * Has this post already gone out? A run can post and then fail to record it
 * (the commit back to main fails, the job is cancelled); the next run must not
 * post it again. Matches the caption's opening on the account's recent media.
 */
export async function alreadyPosted(api, userId, p) {
  const head = captionOf(p).slice(0, 80);
  const { data = [] } = await api.get(`${userId}/media`, { fields: "id,caption,permalink,timestamp", limit: "25" });
  return data.find((m) => (m.caption || "").startsWith(head)) || null;
}

/** Post one: containers, wait, publish, first comment. Returns { id, permalink }. */
export async function publishPost(api, userId, p, urlFor, opts = {}) {
  const caption = captionOf(p);
  let creation;
  if (p.type === "carousel") {
    const children = [];
    for (const m of p.media) {
      const video = /\.mp4$/i.test(m);
      const c = await api.post(`${userId}/media`, {
        is_carousel_item: "true",
        ...(video ? { media_type: "VIDEO", video_url: await urlFor(m) } : { image_url: await urlFor(m) }),
      });
      if (video) await ready(api, c.id, opts);
      children.push(c.id);
    }
    creation = await api.post(`${userId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption });
  } else if (p.type === "reel") {
    const params = { media_type: "REELS", video_url: await urlFor(p.media[0]), caption, share_to_feed: "true" };
    if (p.coverOffsetMs != null) params.thumb_offset = String(p.coverOffsetMs);
    creation = await api.post(`${userId}/media`, params);
  } else {
    creation = await api.post(`${userId}/media`, { image_url: await urlFor(p.media[0]), caption });
  }
  await ready(api, creation.id, opts);
  const { id } = await api.post(`${userId}/media_publish`, { creation_id: creation.id });
  if (p.firstComment) {
    try { await api.post(`${id}/comments`, { message: p.firstComment }); }
    catch (e) { console.warn(`  posted, but the first comment failed: ${e.message}`); }
  }
  const { permalink } = await api.get(id, { fields: "permalink" }).catch(() => ({}));
  return { id, permalink };
}

/**
 * The Instagram account behind the token: IG_USER_ID if set, else the one
 * linked to the token's Page (a system user's token sees only the assets
 * assigned to it). More than one account is an error rather than a guess.
 */
export async function findUserId(api, given) {
  if (given) return given;
  const { data = [] } = await api.get("me/accounts", { fields: "name,instagram_business_account{id,username}" });
  const linked = data.filter((p) => p.instagram_business_account?.id);
  if (linked.length === 1) return linked[0].instagram_business_account.id;
  if (!linked.length) throw new Error("the token's Pages have no linked Instagram account (Page settings → Linked accounts)");
  throw new Error(`the token reaches several Instagram accounts (${linked.map((p) => p.instagram_business_account.username || p.name).join(", ")}): set IG_USER_ID`);
}

// ---------------------------------------------------------------------------
// Insights -> performance.md

const MEDIA_METRICS = ["reach", "views", "saved", "shares", "likes", "comments"];

/** Numbers for the posts of one week, summed; metrics the API refuses are skipped. */
export async function weekInsights(api, posts) {
  const total = Object.fromEntries(MEDIA_METRICS.map((m) => [m, 0]));
  let best = null;
  for (const p of posts.filter((x) => x.mediaId)) {
    const row = {};
    for (const m of MEDIA_METRICS) {
      try {
        const { data = [] } = await api.get(`${p.mediaId}/insights`, { metric: m });
        row[m] = Number(data[0]?.values?.[0]?.value ?? data[0]?.total_value?.value ?? 0) || 0;
      } catch { row[m] = 0; }
      total[m] += row[m];
    }
    const score = row.saved + row.shares;
    if (!best || score > best.score) best = { id: p.id, score };
  }
  return { total, best: best?.id || "" };
}

/** Fill this week's row in performance.md (adds the row if missing), keeping
 *  anything the founder typed in the columns the API cannot give. */
export function writePerformance(md, week, nums) {
  const cols = ["Week", "Followers", "Reach", "Reel plays", "Avg watch (s)", "Saves", "Shares", "Profile visits", "Link clicks", "Trials", "Paid projects", "Best post", "Notes"];
  const lines = md.trimEnd().split("\n");
  const idx = lines.findIndex((l) => l.startsWith(`| ${week} `));
  const old = idx >= 0 ? lines[idx].split("|").slice(1, -1).map((c) => c.trim()) : cols.map(() => "");
  const set = { Week: week, Followers: nums.followers, Reach: nums.total.reach, "Reel plays": nums.total.views, Saves: nums.total.saved, Shares: nums.total.shares, "Best post": nums.best };
  const row = cols.map((c, i) => (set[c] !== undefined && set[c] !== "" ? String(set[c]) : old[i] || ""));
  const line = `| ${row.join(" | ")} |`;
  if (idx >= 0) lines[idx] = line; else lines.push(line);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Media hosting: the bucket, via gcloud (authenticated by the workflow).

function gcsUrlFor(weekDir, week) {
  const bucket = process.env.SOCIAL_BUCKET || "sitetru-india-files";
  return async (file) => {
    const dest = `gs://${bucket}/social/${week}/${file}`;
    execFileSync("gcloud", ["storage", "cp", "--quiet", join(weekDir, file), dest], { stdio: "inherit" });
    // Signed with the service account's key (the workflow's credentials file).
    const key = process.env.GOOGLE_APPLICATION_CREDENTIALS ? ["--private-key-file", process.env.GOOGLE_APPLICATION_CREDENTIALS] : [];
    const out = execFileSync("gcloud", ["storage", "sign-url", dest, "--duration=3h", ...key, "--format=value(signed_url)"], { encoding: "utf8" });
    const url = out.trim().split(/\s+/).find((x) => x.startsWith("https://"));
    if (!url) throw new Error(`could not sign ${dest}`);
    return url;
  };
}

// ---------------------------------------------------------------------------

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const schedules = loadSchedules();

  if (cmd === "approve") {
    const [week, which = "all"] = args;
    const s = schedules.find((x) => x.week === week);
    if (!s) throw new Error(`no schedule for ${week} (have: ${schedules.map((x) => x.week).join(", ") || "none"})`);
    const changed = approve(s, which);
    saveSchedule(s);
    console.log(changed.length ? `approved in ${week}: ${changed.join(", ")}` : `nothing to approve in ${week}`);
    return;
  }

  const token = process.env.IG_ACCESS_TOKEN;
  if (!dry && !token) {
    console.log("IG_ACCESS_TOKEN is not set: nothing posted. See marketing/social/README.md.");
    return;
  }
  const api = graph({ token, version: process.env.IG_GRAPH_VERSION || "v23.0" });
  const userId = dry && !token ? "dry-run" : await findUserId(api, process.env.IG_USER_ID);

  if (cmd === "publish") {
    const due = duePosts(schedules);
    if (!due.length) { console.log("nothing due"); return; }
    for (const { schedule, post } of due) {
      const weekDir = dirname(schedule.file);
      const problems = checkPost(post, weekDir);
      console.log(`${schedule.week} ${post.id} (${post.type}, due ${post.at})`);
      if (problems.length) {
        post.status = "blocked"; post.error = problems.join("; ");
        console.log(`  blocked: ${post.error}`); saveSchedule(schedule); continue;
      }
      if (dry) { console.log("  dry run: would post"); continue; }
      try {
        const seen = await alreadyPosted(api, userId, post);
        const r = seen ? { id: seen.id, permalink: seen.permalink } : await publishPost(api, userId, post, gcsUrlFor(weekDir, schedule.week));
        Object.assign(post, { status: "posted", mediaId: r.id, permalink: r.permalink || "", postedAt: new Date().toISOString() });
        delete post.error;
        console.log(`  ${seen ? "already posted" : "posted"}: ${r.permalink || r.id}`);
      } catch (e) {
        post.error = e.message;
        console.log(`  failed (will retry next run while due): ${e.message}`);
      }
      saveSchedule(schedule);
    }
    return;
  }

  if (cmd === "insights") {
    const perf = join(HERE, "performance.md");
    let md = readFileSync(perf, "utf8");
    const { followers_count } = await api.get(userId, { fields: "followers_count" }).catch(() => ({}));
    for (const s of schedules.slice(-2)) {
      const nums = await weekInsights(api, s.posts);
      md = writePerformance(md, s.week, { ...nums, followers: s === schedules.at(-1) ? followers_count ?? "" : "" });
    }
    writeFileSync(perf, md);
    console.log(`performance.md updated (followers: ${followers_count ?? "n/a"})`);
    return;
  }

  throw new Error("usage: publish.mjs publish [--dry-run] | approve <week> <all|1,2> | insights");
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
