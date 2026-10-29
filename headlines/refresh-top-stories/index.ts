// Supabase Edge Function: refresh-top-stories (project rpatomxgobrljilgbmub).
// For each country, the top 3 stories (front-page order) from its 5 most-read outlets, lowbrow stories left out
// (lowbrow.js: fixed rules, then Claude's verdict, with the outlet's next story taking the place) and translated to
// English with the Claude API. Processes the countries not yet refreshed today, `limit` per call; meant to be called
// every ~10 minutes by pg_cron.
// Deploy: supabase functions deploy refresh-top-stories --no-verify-jwt (index.ts with lowbrow.js beside it)
// Secret needed: ANTHROPIC_API_KEY (without it, non-English titles are stored untranslated and only the fixed rules
// filter).
// Access: the schedule calls it with no key and gets the defaults, bounded by the once-a-day guard. Anything that
// spends Claude credits beyond that (one named country, a batch over 6, a larger backfill) needs a server key: the
// service-role key the function already holds, or one of the project's secret keys.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";
import { RUBRIC, pickStories, ruleHit } from "./lowbrow.js";

const OUTLETS_URL = "https://jdpi.pages.dev/headlines/outlets.json";
const UA = "Mozilla/5.0 (compatible; JDP-I headlines; +https://jdpi.pages.dev)";
const ENGLISH = new Set(["US", "CA", "GB", "IE", "JM", "BS", "BB", "TT", "AG", "DM", "GD", "KN", "LC", "VC", "BZ", "MT"]);
const CANDIDATES = 5; // front-page items read per outlet, so a lowbrow story's place goes to the outlet's next one
const KEEP = 3; // stories tracked per outlet

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const claude = apiKey ? new Anthropic({ apiKey }) : null;

// Server keys: SUPABASE_SECRET_KEYS is a JSON object of named keys on newer projects.
const keysFrom = (raw?: string) => {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return v && typeof v === "object" ? Object.values(v).map(String) : [String(v)]; } catch { return [raw]; }
};
const SERVER_KEYS = new Set([Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), ...keysFrom(Deno.env.get("SUPABASE_SECRET_KEYS"))].filter((k): k is string => !!k));
const isServer = (req: Request) =>
  SERVER_KEYS.has((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")) || SERVER_KEYS.has(req.headers.get("apikey") ?? "");
const BACKFILL_EVERY_MS = 9 * 60 * 1000; // callers without a server key: no more often than the schedule runs
const BACKFILL_DAYS = 3; // older stories whose translation keeps failing stay untranslated rather than retried forever
const BACKFILL_ROWS = 100; // stories per backfill run without a server key

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function parseFeed(xml: string, googleNews: boolean) {
  const items = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map(m => m[0]);
  return items.map(it => {
    let title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(it)?.[1] ?? "");
    if (googleNews) title = title.replace(/\s+-\s+[^-]+$/, ""); // Google News appends " - Outlet"
    const link = decode(/<link[^>]*>([\s\S]*?)<\/link>/i.exec(it)?.[1] ?? "") || (/<link[^>]+href="([^"]+)"/i.exec(it)?.[1] ?? "");
    const date = decode(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/i.exec(it)?.[2] ?? "");
    return { title, link, published: date ? new Date(date) : null };
  }).filter(x => x.title && /^https?:/.test(x.link));
}

async function fetchText(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,*/*" }, signal: ctrl.signal });
    return r.ok ? await r.text() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// One request per country (or backfill batch): a lowbrow verdict for each headline (lowbrow.js RUBRIC) and, with
// `translate`, its English title. Structured output keeps the reply parseable. A refusal or a reply of the wrong length
// gives no verdicts (nulls); an API error is thrown, so the country is retried on the next run.
type Verdict = { en: string | null; lowbrow: boolean } | null;
const SCREEN_FORMAT = {
  type: "json_schema",
  schema: {
    type: "object", additionalProperties: false, required: ["items"],
    properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["en", "lowbrow"], properties: { en: { type: "string" }, lowbrow: { type: "boolean" } } } } }
  }
};
async function screen(titles: string[], translate: boolean): Promise<{ verdicts: Verdict[]; usage: { input: number; output: number } }> {
  const none = (usage = { input: 0, output: 0 }) => ({ verdicts: titles.map((): Verdict => null), usage });
  if (!claude || !titles.length) return none();
  const ask = translate
    ? "For each news headline below, give its natural English translation as en (keep names, numbers and meaning exact; do not add or omit facts; if a headline is already English, return it unchanged) and say whether it is lowbrow. For a lowbrow headline, en can be an empty string."
    : "For each English news headline below, say whether it is lowbrow, with en as an empty string.";
  const msg = await claude.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low", format: SCREEN_FORMAT },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: `${ask}\n\n${RUBRIC}\n\nReturn one item per headline, in the same order.\n\n${JSON.stringify(titles)}` }]
  } as any);
  const usage = { input: msg.usage?.input_tokens ?? 0, output: msg.usage?.output_tokens ?? 0 };
  if (msg.stop_reason === "refusal") return none(usage);
  const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  try {
    const items = JSON.parse(text).items;
    if (!Array.isArray(items) || items.length !== titles.length) return none(usage);
    return {
      usage, verdicts: items.map((x: any): Verdict => x && typeof x.lowbrow === "boolean"
        ? { lowbrow: x.lowbrow, en: translate && typeof x.en === "string" && x.en.trim() ? x.en.trim() : null } : null)
    };
  } catch { return none(usage); }
}

async function refreshCountry(cc: string, outlets: { name: string; home: string; rss: string; via: string }[], today: string) {
  const english = ENGLISH.has(cc);
  // Each outlet's first CANDIDATES front-page items. The fixed rules take the obvious lowbrow ones without an API call;
  // Claude judges (and outside the English-speaking countries translates) the rest in one request for the country.
  const feeds = (await Promise.all(outlets.slice(0, 5).map(async (o, i) => {
    const xml = await fetchText(o.rss);
    return xml ? { o, i, items: parseFeed(xml, o.via === "google-news").slice(0, CANDIDATES).map(it => ({ ...it, rule: ruleHit(it.link, it.title) as string | null, verdict: null as Verdict })) } : null;
  }))).filter((f): f is NonNullable<typeof f> => f !== null);
  const asked = feeds.flatMap(f => f.items.filter(it => !it.rule));
  const { verdicts, usage } = await screen(asked.map(it => it.title), !english);
  asked.forEach((it, k) => { it.verdict = verdicts[k]; });
  const rows: Record<string, unknown>[] = [], left: { outlet: string; title: string; reason: string }[] = [];
  for (const { o, i, items } of feeds) {
    const picked = pickStories(items, KEEP);
    picked.left.forEach((it: any) => left.push({ outlet: o.name, title: it.title, reason: it.reason }));
    picked.kept.forEach((it: any, j: number) => rows.push({
      snapshot_date: today, country_code: cc, outlet: o.name, outlet_domain: new URL(o.home).hostname.replace(/^www\./, ""),
      outlet_rank: i + 1, story_rank: j + 1, title_original: it.title, title_en: english ? it.title : it.verdict?.en ?? null,
      url: it.link, published_at: it.published && !isNaN(+it.published) ? it.published.toISOString() : null,
      lowbrow: it.verdict ? false : null, lowbrow_reason: null // null: no verdict yet (refused, or no API key), so the backfill judges it
    }));
  }
  if (rows.length) {
    const { error } = await db.from("country_top_stories").upsert(rows, { onConflict: "snapshot_date,country_code,outlet_domain,story_rank" });
    if (error) throw error;
  }
  await db.from("source_status_history").insert({
    source_key: "country_top_stories", country_code: cc, state: rows.length ? "ready" : "unavailable",
    message: rows.length ? `${rows.length} stories from ${new Set(rows.map(r => r.outlet)).size} outlets${left.length ? `, ${left.length} lowbrow left out` : ""}` : "No outlet feeds responded",
    checked_at: new Date().toISOString(), last_success_at: rows.length ? new Date().toISOString() : null, item_count: rows.length,
    metadata: {
      translated: english ? 0 : rows.filter(r => r.title_en).length, translation: claude ? "claude" : "not configured",
      judged: verdicts.filter(Boolean).length, asked: asked.length, lowbrow: left, usage
    }
  });
  return rows.length;
}

Deno.serve(async (req) => {
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const server = isServer(req);
  const limit = Math.min(Math.max(Number(body.limit) || 6, 1), server ? 12 : 6);
  const today = new Date().toISOString().slice(0, 10);
  const all: Record<string, any[]> = await fetch(OUTLETS_URL).then(r => r.json());
  const one = server && body.country_code && all[body.country_code] ? String(body.country_code) : null;
  let targets: string[];
  if (one) targets = [one];
  else {
    const { data } = await db.from("country_top_stories").select("country_code").eq("snapshot_date", today);
    const done = new Set((data ?? []).map((r: any) => r.country_code));
    targets = Object.keys(all).filter(cc => !done.has(cc)).slice(0, limit);
  }
  const results: Record<string, number | string> = {};
  for (const cc of targets) {
    try { results[cc] = await refreshCountry(cc, all[cc], today); }
    catch (e) { results[cc] = `error: ${(e as Error).message}`; }
  }
  // Catch up, newest first, on stories still without a lowbrow verdict (a refused request, or stored before the filter;
  // any age, each judged once: one Claude can't judge counts as news) or an English title (within BACKFILL_DAYS
  // without a server key). A lowbrow verdict hides the story (lowbrow = true; readers ask for lowbrow=not.is.true)
  // rather than deleting it. Without a server key, no more often than the schedule; each run is logged first, so the
  // next caller sees it.
  let backfilled = 0, judged = 0, hidden = 0, backfillError: string | null = null, backfillSkipped: string | null = null;
  if (claude && !one) {
    let due = true;
    if (!server) {
      const { data: last } = await db.from("source_status_history").select("checked_at").eq("source_key", "country_top_stories_backfill")
        .order("checked_at", { ascending: false }).limit(1);
      due = !last?.length || Date.now() - new Date(last[0].checked_at).getTime() >= BACKFILL_EVERY_MS;
    }
    if (!due) backfillSkipped = "a backfill ran less than 9 minutes ago";
    else {
      const since = new Date(Date.now() - BACKFILL_DAYS * 864e5).toISOString().slice(0, 10);
      const pendingFilter = server ? "lowbrow.is.null,and(title_en.is.null,lowbrow.is.false)" : `lowbrow.is.null,and(title_en.is.null,lowbrow.is.false,snapshot_date.gte.${since})`;
      const { data: pending } = await db.from("country_top_stories").select("*").or(pendingFilter)
        .order("snapshot_date", { ascending: false }).limit(server ? Math.min(Number(body.backfill) || BACKFILL_ROWS, 300) : BACKFILL_ROWS);
      if (pending?.length) {
        await db.from("source_status_history").insert({
          source_key: "country_top_stories_backfill", state: "ready", message: `Checking ${pending.length} stories`,
          item_count: pending.length, metadata: { server },
        });
        const rows = pending.map(({ id: _id, ...r }: any) => ({ ...r, title_original: decode(r.title_original) }));
        // The fixed rules first; then one request for the stories needing an English title, one for the rest.
        for (const r of rows) {
          const why = r.lowbrow === null ? ruleHit(r.url, r.title_original, r.title_en) : null;
          if (why) Object.assign(r, { lowbrow: true, lowbrow_reason: why });
        }
        const toTranslate = rows.filter((r: any) => !r.title_en && r.lowbrow !== true), toJudge = rows.filter((r: any) => r.title_en && r.lowbrow === null);
        const judge = (r: any, v: Verdict) => { if (r.lowbrow === null) Object.assign(r, v?.lowbrow ? { lowbrow: true, lowbrow_reason: "classifier" } : { lowbrow: false }); };
        try {
          const [t, j] = await Promise.all([screen(toTranslate.map((r: any) => r.title_original), true), screen(toJudge.map((r: any) => r.title_en), false)]);
          toTranslate.forEach((r: any, k: number) => { if (t.verdicts[k]?.en) r.title_en = t.verdicts[k]!.en; judge(r, t.verdicts[k]); });
          toJudge.forEach((r: any, k: number) => judge(r, j.verdicts[k]));
          const { error } = await db.from("country_top_stories").upsert(rows, { onConflict: "snapshot_date,country_code,outlet_domain,story_rank" });
          if (error) backfillError = error.message;
          else {
            backfilled = toTranslate.filter((r: any) => r.title_en).length;
            judged = rows.length;
            hidden = rows.filter((r: any) => r.lowbrow === true).length;
          }
        } catch (e) { backfillError = (e as Error).message; }
        if (backfillError) await db.from("source_status_history").insert({
          source_key: "country_top_stories_backfill", state: "unavailable", message: `Backfill failed: ${backfillError}`.slice(0, 500),
          item_count: 0, metadata: { server },
        });
      }
    }
  }
  return new Response(JSON.stringify({ date: today, translation: claude ? "claude" : "not configured", results, backfilled, judged, hidden, backfillError, backfillSkipped }), { headers: { "Content-Type": "application/json" } });
});
