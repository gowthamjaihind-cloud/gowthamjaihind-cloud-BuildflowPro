import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSchedules, duePosts, checkPost, approve, captionOf, graph, publishPost, alreadyPosted, writePerformance, findUserId } from "./publish.mjs";

const post = (over = {}) => ({
  id: "p1", at: "2026-11-30T19:30:00+05:30", type: "image", media: ["a.png"],
  caption: "Hello sites.", hashtags: ["sitetru", "#builders"], status: "approved", ...over,
});

/** A fake Graph API that records calls. */
function fakeGraph(media: { caption: string; id: string }[] = []) {
  const calls: string[] = [];
  let n = 0;
  const fetchImpl = async (url: URL | string, init?: { method?: string; body?: URLSearchParams }) => {
    const u = new URL(String(url));
    const params = init?.body ? Object.fromEntries(init.body) : Object.fromEntries(u.searchParams);
    const path = u.pathname.replace(/^\/v[\d.]+\//, "");
    calls.push(`${init?.method || "GET"} ${path} ${JSON.stringify({ ...params, access_token: undefined })}`);
    let body: object = {};
    if (path.endsWith("/media") && init?.method === "POST") body = { id: `c${++n}` };
    else if (path.endsWith("/media")) body = { data: media };
    else if (path.endsWith("/media_publish")) body = { id: "m1" };
    else if (path.endsWith("/comments")) body = { id: "k1" };
    else if (params.fields === "status_code") body = { status_code: "FINISHED" };
    else if (params.fields === "permalink") body = { permalink: "https://instagram.com/p/x" };
    return { ok: true, json: async () => body } as Response;
  };
  return { api: graph({ token: "T", fetchImpl }), calls };
}

describe("what is due", () => {
  const s = { week: "2026-W49", file: "", posts: [post(), post({ id: "p2", status: "draft" }), post({ id: "p3", at: "2026-12-01T19:30:00+05:30" })] };
  it("only approved posts whose time has come, and not ones a day late", () => {
    expect(duePosts([s], new Date("2026-11-30T14:05:00Z")).map((d: any) => d.post.id)).toEqual(["p1"]);
    expect(duePosts([s], new Date("2026-11-30T13:00:00Z"))).toEqual([]);
    expect(duePosts([s], new Date("2026-12-01T03:00:00Z")).map((d: any) => d.post.id)).toEqual([]);
  });
  it("approves all drafts, or the numbered ones", () => {
    const a = { posts: [post({ status: "draft" }), post({ id: "p2", status: "draft" }), post({ id: "p3", status: "posted" })] };
    expect(approve(a, "2")).toEqual(["p2"]);
    expect(approve(a, "all")).toEqual(["p1"]);
    expect(a.posts.map((p) => p.status)).toEqual(["approved", "approved", "posted"]);
  });
});

describe("checks before uploading", () => {
  const dir = mkdtempSync(join(tmpdir(), "social-"));
  writeFileSync(join(dir, "a.png"), "x");
  writeFileSync(join(dir, "r.mp4"), "x");
  it("a missing file, a one-slide carousel or a still as a reel are caught", () => {
    expect(checkPost(post(), dir)).toEqual([]);
    expect(checkPost(post({ media: ["gone.png"] }), dir)).toEqual(["missing gone.png"]);
    expect(checkPost(post({ type: "carousel" }), dir)).toContain("a carousel needs 2 to 10 files");
    expect(checkPost(post({ type: "reel" }), dir)).toContain("a.png: a reel must be .mp4");
    expect(checkPost(post({ type: "reel", media: ["r.mp4"] }), dir)).toEqual([]);
  });
  it("caption gets the hashtags and Instagram's length limit", () => {
    expect(captionOf(post())).toBe("Hello sites.\n\n#sitetru #builders");
    expect(() => captionOf(post({ caption: "x".repeat(2300) }))).toThrow(/2,200/);
  });
  it("week 49's schedule is valid apart from the founder reel still to record", () => {
    const [w] = loadSchedules().filter((s: any) => s.week === "2026-W49");
    const problems = w.posts.map((p: any) => checkPost(p, join(__dirname, "weeks", "2026-W49")));
    expect(problems.slice(0, 4)).toEqual([[], [], [], []]);
    expect(problems[4]).toEqual(["missing founder-reel.mp4"]);
    expect(w.posts.every((p: any) => p.status === "draft")).toBe(true);
  });
});

describe("posting", () => {
  it("a carousel: one container per slide, the carousel, publish, first comment", async () => {
    const { api, calls } = fakeGraph();
    const r = await publishPost(api, "U", post({ type: "carousel", media: ["1.png", "2.png"], firstComment: "Hi" }), async (f: string) => `https://cdn/${f}`, { every: 0 });
    expect(r).toEqual({ id: "m1", permalink: "https://instagram.com/p/x" });
    const posts = calls.filter((c) => c.startsWith("POST"));
    expect(posts[0]).toContain('"image_url":"https://cdn/1.png"');
    expect(posts[0]).toContain('"is_carousel_item":"true"');
    expect(posts[2]).toContain('"media_type":"CAROUSEL","children":"c1,c2"');
    expect(posts[3]).toContain("U/media_publish");
    expect(posts[4]).toContain('m1/comments {"message":"Hi"}');
  });
  it("a reel goes up as REELS, shared to the feed", async () => {
    const { api, calls } = fakeGraph();
    await publishPost(api, "U", post({ type: "reel", media: ["r.mp4"], coverOffsetMs: 4000 }), async (f: string) => `https://cdn/${f}`, { every: 0 });
    expect(calls.find((c) => c.includes("REELS"))).toContain('"share_to_feed":"true","thumb_offset":"4000"');
  });
  it("a post already on the account is found, so a retry never posts twice", async () => {
    const { api } = fakeGraph([{ id: "old", caption: "Hello sites.\n\n#sitetru #builders" }]);
    expect((await alreadyPosted(api, "U", post()))?.id).toBe("old");
    expect(await alreadyPosted(api, "U", post({ caption: "Different" }))).toBeNull();
  });
  it("never puts the token in an error message", async () => {
    const api = graph({ token: "SECRET", fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid parameter" } }) }) as any });
    await expect(api.post("U/media", {})).rejects.toThrow(/^Instagram POST U\/media: Invalid parameter$/);
  });
});

describe("performance.md", () => {
  it("fills the API's columns and keeps what the founder typed", () => {
    const md = readFileSync(join(__dirname, "performance.md"), "utf8").replace("| 2026-W49 | | | | | | | | | | | | launch week |", "| 2026-W49 | | | | | | | 300 | 40 | 3 | 0 | | launch week |");
    const out = writePerformance(md, "2026-W49", { followers: 120, total: { reach: 5000, views: 8000, saved: 60, shares: 25 }, best: "w49-3-telegram" });
    expect(out).toContain("| 2026-W49 | 120 | 5000 | 8000 |  | 60 | 25 | 300 | 40 | 3 | 0 | w49-3-telegram | launch week |");
    expect(writePerformance(out, "2026-W50", { followers: 150, total: { reach: 1, views: 2, saved: 3, shares: 4 }, best: "" })).toMatch(/\| 2026-W50 \| 150 \| 1 \| 2 \|/);
  });
});

describe("which Instagram account", () => {
  const withPages = (data: object[]) => graph({ token: "T", fetchImpl: async () => ({ ok: true, json: async () => ({ data }) }) as any });
  it("uses IG_USER_ID when set, else the one linked to the token's Page", async () => {
    expect(await findUserId(withPages([]), "123")).toBe("123");
    expect(await findUserId(withPages([{ name: "Sitetru", instagram_business_account: { id: "1784", username: "sitetru" } }]))).toBe("1784");
  });
  it("refuses to guess between accounts, and says when none is linked", async () => {
    await expect(findUserId(withPages([{ name: "Sitetru" }]))).rejects.toThrow(/no linked Instagram/);
    await expect(findUserId(withPages([
      { name: "A", instagram_business_account: { id: "1", username: "a" } },
      { name: "B", instagram_business_account: { id: "2", username: "b" } },
    ]))).rejects.toThrow(/several Instagram accounts \(a, b\)/);
  });
});
