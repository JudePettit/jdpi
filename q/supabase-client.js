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

    // Top 3 stories from each of the country's 5 most-read outlets (front-page order), English titles.
    async topStories(countryCode, startDate, endDate) {
      return request(tablePath("country_top_stories", {
        select: "snapshot_date,outlet,outlet_domain,outlet_rank,story_rank,title_original,title_en,url,published_at",
        country_code: `eq.${countryCode}`,
        and: `(snapshot_date.gte.${startDate},snapshot_date.lte.${endDate})`,
        order: "snapshot_date.desc,outlet_rank.asc,story_rank.asc",
        limit: "2000"
      }));
    },

    async latestTopStories(countryCode) {
      const latest = await request(tablePath("country_top_stories", {
        select: "snapshot_date", country_code: `eq.${countryCode}`, order: "snapshot_date.desc", limit: "1"
      }));
      if (!latest?.length) return [];
      const d = latest[0].snapshot_date;
      return this.topStories(countryCode, d, d);
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
