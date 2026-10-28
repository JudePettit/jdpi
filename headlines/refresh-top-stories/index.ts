// Supabase Edge Function: refresh-top-stories (project rpatomxgobrljilgbmub).
// For each country, the top 3 stories (front-page order) from its 5 most-read outlets,
// translated to English with the Claude API. Processes the countries not yet refreshed
// today, `limit` per call; meant to be called every ~10 minutes by pg_cron.
// Deploy: supabase functions deploy refresh-top-stories --no-verify-jwt
// Secret needed: ANTHROPIC_API_KEY (without it, non-English titles are stored untranslated).
// Access: the schedule calls it with no key and gets the defaults, bounded by the once-a-day guard. Anything that
// spends Claude credits beyond that (one named country, a batch over 6, a larger translation backfill) needs a server
// key: the service-role key the function already holds, or one of the project's secret keys.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";

const OUTLETS_URL = "https://jdpi.pages.dev/headlines/outlets.json";
const UA = "Mozilla/5.0 (compatible; JDP-I headlines; +https://jdpi.pages.dev)";
const ENGLISH = new Set(["US", "CA", "GB", "IE", "JM", "BS", "BB", "TT", "AG", "DM", "GD", "KN", "LC", "VC", "BZ", "MT"]);

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

async function translate(titles: string[]): Promise<(string | null)[]> {
  if (!claude || !titles.length) return titles.map(() => null);
  const msg = await claude.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{
      role: "user",
      content: "Translate each news headline below into natural English. Keep names, numbers and meaning exact; do not add or omit facts. If a headline is already English, return it unchanged. Reply with only a JSON array of strings, one per headline, in the same order.\n\n" + JSON.stringify(titles)
    }]
  } as any);
  if (msg.stop_reason === "refusal") return titles.map(() => null);
  const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  try {
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    return Array.isArray(arr) && arr.length === titles.length ? arr.map((x: unknown) => typeof x === "string" ? x : null) : titles.map(() => null);
  } catch { return titles.map(() => null); }
}

async function refreshCountry(cc: string, outlets: { name: string; home: string; rss: string; via: string }[], today: string) {
  const rows: Record<string, unknown>[] = [];
  await Promise.all(outlets.slice(0, 5).map(async (o, i) => {
    const xml = await fetchText(o.rss);
    if (!xml) return;
    parseFeed(xml, o.via === "google-news").slice(0, 3).forEach((it, j) => rows.push({
      snapshot_date: today, country_code: cc, outlet: o.name, outlet_domain: new URL(o.home).hostname.replace(/^www\./, ""),
      outlet_rank: i + 1, story_rank: j + 1, title_original: it.title, title_en: ENGLISH.has(cc) ? it.title : null,
      url: it.link, published_at: it.published && !isNaN(+it.published) ? it.published.toISOString() : null
    }));
  }));
  const need = rows.filter(r => r.title_en === null);
  if (need.length) {
    const out = await translate(need.map(r => r.title_original as string));
    need.forEach((r, k) => { r.title_en = out[k]; });
  }
  if (rows.length) {
    const { error } = await db.from("country_top_stories").upsert(rows, { onConflict: "snapshot_date,country_code,outlet_domain,story_rank" });
    if (error) throw error;
  }
  await db.from("source_status_history").insert({
    source_key: "country_top_stories", country_code: cc, state: rows.length ? "ready" : "unavailable",
    message: rows.length ? `${rows.length} stories from ${new Set(rows.map(r => r.outlet)).size} outlets` : "No outlet feeds responded",
    checked_at: new Date().toISOString(), last_success_at: rows.length ? new Date().toISOString() : null, item_count: rows.length,
    metadata: { translated: claude ? need.length : 0, translation: claude ? "claude" : "not configured" }
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
  // Catch up on recent stories whose translation failed (or predates it), newest first; without a server key, no more
  // often than the schedule. Each run is logged first, so the next caller sees it.
  let backfilled = 0, backfillError: string | null = null, backfillSkipped: string | null = null;
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
      let query = db.from("country_top_stories").select("*").is("title_en", null);
      if (!server) query = query.gte("snapshot_date", since);
      const { data: pending } = await query.order("snapshot_date", { ascending: false }).limit(server ? Math.min(Number(body.backfill) || 60, 200) : 60);
      if (pending?.length) {
        await db.from("source_status_history").insert({
          source_key: "country_top_stories_backfill", state: "ready", message: `Translating ${pending.length} stories`,
          item_count: pending.length, metadata: { server },
        });
        const rows = pending.map(({ id: _id, ...r }: any) => ({ ...r, title_original: decode(r.title_original) }));
        const out = await translate(rows.map((r: any) => r.title_original));
        rows.forEach((r: any, k: number) => { r.title_en = out[k]; });
        const { error } = await db.from("country_top_stories").upsert(rows, { onConflict: "snapshot_date,country_code,outlet_domain,story_rank" });
        if (error) backfillError = error.message; else backfilled = out.filter(Boolean).length;
      }
    }
  }
  return new Response(JSON.stringify({ date: today, translation: claude ? "claude" : "not configured", results, backfilled, backfillError, backfillSkipped }), { headers: { "Content-Type": "application/json" } });
});
