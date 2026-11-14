(function (global) {
  const config = global.GTTS_SUPABASE;
  if (!config?.url || !config?.publishableKey) {
    global.GTTSDB = null;
    return;
  }

  const root = config.url.replace(/\/$/, "");
  const headers = { apikey: config.publishableKey, Accept: "application/json" };

  async function request(path, options = {}) {
    const response = await fetch(`${root}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(body?.error || body?.message || `Supabase returned HTTP ${response.status}`);
      error.status = response.status;
      error.payload = body;
      throw error;
    }
    return body;
  }

  // Jude, 25 October 2026: translate before loading. A stored story whose English title has not arrived yet (title_en is
  // null until the Edge Function translates it) is not shown at all, never as "translation pending": every query of the
  // stories asks only for translated ones, and their rows are checked again here, so every list and count on a page
  // (the Global Headline Tracker, National Analysis's latest headlines, Realtime Battlefield's stories) counts only what
  // it shows. English-language outlets' stories carry their own title as title_en.
  const TRANSLATED = "not.is.null";
  const translated = rows => (Array.isArray(rows) ? rows.filter(r => r && typeof r.title_en === "string" && r.title_en.trim()) : rows);

  function tablePath(table, params) {
    return `/rest/v1/${table}?${new URLSearchParams(params).toString()}`;
  }

  global.GTTSDB = Object.freeze({
    async calendarSnapshotOnOrBefore(date) {
      const rows = await request(tablePath("calendar_snapshots", {
        select: "snapshot_date,source_data_date,events,state,message,item_count,captured_at",
        snapshot_date: `lte.${date}`,
        order: "snapshot_date.desc",
        limit: "1"
      }));
      return rows?.[0] || null;
    },

    async calendarCatalog() {
      return request(tablePath("calendar_events", {
        select: "event_key,event_date,country,title,event_type,status,source_url,source_data_date",
        order: "event_date.asc"
      }));
    },

    async headlineSnapshots(countryCode, startDate, endDate) {
      return request(tablePath("country_headline_snapshots", {
        select: "snapshot_date,country_code,country_name,rank,title,article_url,domain,published_at,captured_at",
        country_code: `eq.${countryCode}`,
        and: `(snapshot_date.gte.${startDate},snapshot_date.lte.${endDate})`,
        order: "snapshot_date.desc,rank.asc",
        limit: "1000"
      }));
    },

    // Top 3 stories from each of the country's 5 most-read outlets (front-page order), English titles. Stories the
    // lowbrow filter hid (lowbrow = true, headlines/refresh-top-stories/lowbrow.js) are left out of every query here;
    // lowbrow is null while a story waits for its verdict.
    async topStories(countryCode, startDate, endDate) {
      return translated(await request(tablePath("country_top_stories", {
        select: "snapshot_date,outlet,outlet_domain,outlet_rank,story_rank,title_original,title_en,url,published_at,lowbrow,captured_at",
        country_code: `eq.${countryCode}`,
        lowbrow: "not.is.true",
        title_en: TRANSLATED,
        and: `(snapshot_date.gte.${startDate},snapshot_date.lte.${endDate})`,
        order: "snapshot_date.desc,outlet_rank.asc,story_rank.asc",
        limit: "2000"
      })));
    },

    async latestTopStories(countryCode) {
      const latest = await request(tablePath("country_top_stories", {
        select: "snapshot_date", country_code: `eq.${countryCode}`, lowbrow: "not.is.true", title_en: TRANSLATED, order: "snapshot_date.desc", limit: "1"
      }));
      if (!latest?.length) return [];
      const d = latest[0].snapshot_date;
      return this.topStories(countryCode, d, d);
    },

    // Recent top stories (any country) whose headline mentions one of the keywords; used by Realtime Battlefield.
    async storiesMatching(keywords, sinceDate, limit = 30) {
      const terms = keywords.map(k => k.replace(/[^\p{L}\p{N} -]/gu, "")).filter(Boolean);
      if (!terms.length) return [];
      return translated(await request(tablePath("country_top_stories", {
        select: "snapshot_date,country_code,outlet,outlet_domain,title_original,title_en,url,published_at",
        snapshot_date: `gte.${sinceDate}`,
        lowbrow: "not.is.true",
        title_en: TRANSLATED,
        or: `(${terms.flatMap(t => [`title_en.ilike.*${t}*`, `title_original.ilike.*${t}*`]).join(",")})`,
        order: "snapshot_date.desc,outlet_rank.asc,story_rank.asc",
        limit: String(limit)
      })));
    },

    async latestHeadlineStatus(countryCode) {
      const rows = await request(tablePath("source_status_history", {
        select: "state,message,checked_at,last_success_at,item_count,metadata",
        source_key: "eq.country_headlines",
        country_code: `eq.${countryCode}`,
        order: "checked_at.desc",
        limit: "1"
      }));
      return rows?.[0] || null;
    },

    async refreshCountryHeadlines(countryCode, countryName, force = false) {
      return request("/functions/v1/refresh-country-headlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country_code: countryCode, country_name: countryName, force })
      });
    }
  });
})(window);
