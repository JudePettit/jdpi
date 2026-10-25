/* Shared, browser-local research tools for Political Calendar and Country Headlines. */
(function () {
  "use strict";

  const STORE_KEY = "jdpiq.research-workspace.v1";
  const MAX_EVIDENCE = 500;
  const emptyState = () => ({ version: 1, watchlist: [], evidence: [], sourceHealth: {}, gdeltCooldownUntil: 0 });
  let state = readState();
  let drawer;
  let freshnessNode;

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!parsed || parsed.version !== 1) return emptyState();
      return { ...emptyState(), ...parsed, watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [], evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [] };
    } catch { return emptyState(); }
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      renderToolbar();
      renderDrawer();
      applyMapLayer();
      return true;
    } catch {
      if (freshnessNode) freshnessNode.textContent = "Browser storage is unavailable; saved work could not be written.";
      return false;
    }
  }

  function safeHttpUrl(value) {
    try { const url = new URL(value, location.href); return /^https?:$/.test(url.protocol) ? url.href : ""; }
    catch { return ""; }
  }

  function identity(item) {
    return [item.kind, item.country, item.date, item.sourceUrl || item.title].join("|").toLowerCase();
  }

  function addEvidence(item) {
    const key = identity(item);
    const found = state.evidence.find((saved) => identity(saved) === key);
    if (found) {
      state.evidence = state.evidence.filter((saved) => identity(saved) !== key);
      persist();
      return false;
    }
    state.evidence.unshift({ ...item, id: globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2), note: "", savedAt: new Date().toISOString() });
    state.evidence = state.evidence.slice(0, MAX_EVIDENCE);
    persist();
    return true;
  }

  function isSaved(item) { return state.evidence.some((saved) => identity(saved) === identity(item)); }

  function addWatch(country, code) {
    if (!country) return;
    const found = state.watchlist.find((item) => item.code === code || item.name.toLowerCase() === country.toLowerCase());
    if (found) state.watchlist = state.watchlist.filter((item) => item !== found);
    else state.watchlist.unshift({ name: country, code: code || "", addedAt: new Date().toISOString() });
    persist();
  }

  function isWatched(code, name) {
    return state.watchlist.some((item) => (code && item.code === code) || (name && item.name.toLowerCase() === name.toLowerCase()));
  }

  function button(label, className, onClick) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = className || "research-action";
    el.textContent = label;
    el.addEventListener("click", onClick);
    return el;
  }

  function insertUi() {
    const nav = document.querySelector(".subnav");
    if (nav && !document.querySelector(".research-toolbar")) {
      const toolbar = document.createElement("section");
      toolbar.className = "research-toolbar";
      toolbar.setAttribute("aria-label", "Saved research tools");
      const actions = document.createElement("div");
      actions.className = "research-toolbar-actions";
      actions.append(
        button("Evidence board · 0", "research-action research-board-button", () => openDrawer("evidence")),
        button("Watchlist · 0", "research-action research-watchlist-button", () => openDrawer("watchlist"))
      );
      if (document.querySelector(".calendar")) {
        actions.append(button("Timeline view", "research-action research-timeline-button", toggleTimeline));
      }
      if (document.getElementById("countryname")) {
        const watchButton = button("＋ Watch country", "research-action research-current-watch", toggleCurrentWatch);
        watchButton.hidden = true;
        actions.append(watchButton);
      }
      freshnessNode = document.createElement("span");
      freshnessNode.className = "research-freshness";
      freshnessNode.setAttribute("role", "status");
      toolbar.append(actions, freshnessNode);
      nav.insertAdjacentElement("afterend", toolbar);
    }

    const mapWrap = document.querySelector(".mapwrap");
    if (mapWrap && !mapWrap.querySelector(".map-layers")) {
      const layers = document.createElement("div");
      layers.className = "map-layers";
      layers.setAttribute("role", "group");
      layers.setAttribute("aria-label", "Map layers");
      [["coverage", "All covered"], ["watchlist", "Watchlist"], ["evidence", "Saved evidence"]].forEach(([mode, label]) => {
        const layerButton = button(label, "map-layer" + (mode === "coverage" ? " active" : ""), () => {
          layers.querySelectorAll(".map-layer").forEach((item) => item.classList.remove("active"));
          layerButton.classList.add("active");
          layers.dataset.mode = mode;
          applyMapLayer();
        });
        layerButton.dataset.mode = mode;
        layers.append(layerButton);
      });
      layers.dataset.mode = "coverage";
      mapWrap.append(layers);
    }

    if (!drawer) createDrawer();
    renderToolbar();
    renderDrawer();
    applyCalendarSearch();
    selectLinkedCountry();
  }

  function createDrawer() {
    drawer = document.createElement("dialog");
    drawer.className = "research-drawer";
    drawer.setAttribute("aria-label", "Saved research");
    const header = document.createElement("header");
    header.className = "research-drawer-header";
    const title = document.createElement("strong");
    title.textContent = "Research workspace";
    header.append(title, button("Close", "research-close", () => drawer.close()));
    const tabs = document.createElement("nav");
    tabs.className = "research-drawer-tabs";
    tabs.append(button("Evidence", "research-tab active", () => openDrawer("evidence")), button("Watchlist", "research-tab", () => openDrawer("watchlist")));
    const body = document.createElement("div");
    body.className = "research-drawer-body";
    drawer.append(header, tabs, body);
    drawer.addEventListener("click", (event) => { if (event.target === drawer) drawer.close(); });
    document.body.append(drawer);
  }

  function openDrawer(tab) {
    if (!drawer) createDrawer();
    drawer.dataset.tab = tab;
    drawer.querySelectorAll(".research-tab").forEach((item, index) => item.classList.toggle("active", (tab === "evidence" ? index === 0 : index === 1)));
    renderDrawer();
    if (!drawer.open) drawer.showModal();
  }

  function renderDrawer() {
    if (!drawer) return;
    const body = drawer.querySelector(".research-drawer-body");
    body.replaceChildren();
    if (drawer.dataset.tab === "watchlist") {
      if (!state.watchlist.length) return showEmpty(body, "Your country watchlist is empty. Select a country in Headlines and choose “Watch country”.");
      state.watchlist.forEach((country) => {
        const card = document.createElement("article");
        card.className = "research-card";
        const name = document.createElement("strong"); name.textContent = country.name;
        const meta = document.createElement("div"); meta.className = "research-card-meta"; meta.textContent = country.code ? "ISO " + country.code : "Country watch";
        const open = document.createElement("a"); open.className = "research-link"; open.textContent = "Open headlines ↗"; open.href = "headlines.html?view=current&country=" + encodeURIComponent(country.name);
        const remove = button("Remove", "research-action", () => { state.watchlist = state.watchlist.filter((item) => item !== country); persist(); });
        card.append(name, meta, open, remove); body.append(card);
      });
      return;
    }
    if (!state.evidence.length) return showEmpty(body, "No saved evidence yet. Save a headline or calendar event to build a shared research record on this device.");
    state.evidence.forEach((item) => {
      const card = document.createElement("article"); card.className = "research-card";
      const title = document.createElement("strong"); title.textContent = item.title;
      const meta = document.createElement("div"); meta.className = "research-card-meta"; meta.textContent = [item.kind === "headline" ? "Country headline" : "Political event", item.country, item.date].filter(Boolean).join(" · ");
      const links = document.createElement("div"); links.className = "research-card-links";
      const moduleLink = document.createElement("a"); moduleLink.className = "research-link"; moduleLink.textContent = item.kind === "headline" ? "Open calendar context ↗" : "Open country headlines ↗";
      moduleLink.href = item.kind === "headline" ? "calendar.html?period=contemporary&search=" + encodeURIComponent(item.country || "") : "headlines.html?view=current&country=" + encodeURIComponent(item.country || "");
      links.append(moduleLink);
      if (item.sourceUrl) { const source = document.createElement("a"); source.className = "research-link"; source.href = item.sourceUrl; source.target = "_blank"; source.rel = "noreferrer"; source.textContent = "Open source ↗"; links.append(source); }
      const noteLabel = document.createElement("label"); noteLabel.className = "research-note-label"; noteLabel.textContent = "Analyst note";
      const note = document.createElement("textarea"); note.className = "research-note"; note.rows = 2; note.maxLength = 1200; note.value = item.note || ""; note.placeholder = "Add a private note for this saved item";
      note.addEventListener("change", () => { const saved = state.evidence.find((record) => record.id === item.id); if (saved) { saved.note = note.value; persist(); } });
      const remove = button("Remove saved item", "research-action", () => { state.evidence = state.evidence.filter((record) => record.id !== item.id); persist(); });
      card.append(title, meta, links, noteLabel, note, remove); body.append(card);
    });
  }

  function showEmpty(parent, message) { const empty = document.createElement("p"); empty.className = "research-empty"; empty.textContent = message; parent.append(empty); }

  function renderToolbar() {
    const evidenceButton = document.querySelector(".research-board-button");
    const watchButton = document.querySelector(".research-watchlist-button");
    if (evidenceButton) evidenceButton.textContent = "Evidence board · " + state.evidence.length;
    if (watchButton) watchButton.textContent = "Watchlist · " + state.watchlist.length;
    if (freshnessNode) {
      const lastSuccess = state.sourceHealth.gdelt?.lastSuccessAt;
      const cooldown = Number(state.gdeltCooldownUntil) || 0;
      freshnessNode.textContent = cooldown > Date.now()
        ? "GDELT retry pause until " + new Date(cooldown).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC · rate limit protection"
        : lastSuccess ? "Latest successful GDELT status observed here · " + new Date(lastSuccess).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"
          : "GDELT freshness will appear after the first successful request in this browser.";
    }
    updateCurrentWatchButton();
    updateTimelineButton();
  }

  function updateCurrentWatchButton() {
    const btn = document.querySelector(".research-current-watch");
    const nameEl = document.getElementById("countryname");
    const codeEl = document.getElementById("countrycode");
    if (!btn || !nameEl || !codeEl) return;
    const name = nameEl.textContent.trim();
    const match = codeEl.textContent.match(/ISO\s+([A-Z]{2,3})/);
    const code = match?.[1] || "";
    const active = name && name !== "Select a country" && name !== "Country unavailable";
    btn.hidden = !active;
    const label = active && isWatched(code, name) ? "✓ Watching " + name : "＋ Watch country";
    if (btn.textContent !== label) btn.textContent = label;
  }

  function toggleCurrentWatch() {
    const name = document.getElementById("countryname")?.textContent.trim();
    const code = document.getElementById("countrycode")?.textContent.match(/ISO\s+([A-Z]{2,3})/)?.[1] || "";
    if (name && name !== "Select a country") addWatch(name, code);
  }

  function toggleTimeline() {
    document.body.classList.toggle("jdp-timeline");
    updateTimelineButton();
  }

  function updateTimelineButton() {
    const buttonEl = document.querySelector(".research-timeline-button");
    const buttonLabel = document.body.classList.contains("jdp-timeline") ? "Calendar view" : "Timeline view";
    if (buttonEl && buttonEl.textContent !== buttonLabel) buttonEl.textContent = buttonLabel;
    const label = document.querySelector(".eventlist .listhead span:first-child");
    const listLabel = document.body.classList.contains("jdp-timeline") ? "Timeline · " + (document.getElementById("monthlabel")?.textContent || "") : "Events this month";
    if (label && label.textContent !== listLabel) label.textContent = listLabel;
  }

  function eventForRow(row, country, title) {
    try {
      if (typeof events === "undefined" || !Array.isArray(events)) return null;
      return events.find((item) => item.country === country && item.title === title) || null;
    } catch { return null; }
  }

  function wireCalendarRows() {
    document.querySelectorAll(".eventrow").forEach((row) => {
      if (row.dataset.researchWired) return;
      row.dataset.researchWired = "true";
      const title = row.querySelector(".eventname")?.textContent.trim() || "Political event";
      const countryLine = row.querySelector(".eventcountry")?.textContent.trim() || "";
      const country = countryLine.replace(/\s·\s\d{4}$/, "");
      const year = countryLine.match(/(\d{4})$/)?.[1] || "";
      const dateBox = row.querySelector(".datebox");
      const day = dateBox?.querySelector("b")?.textContent.trim() || "";
      const month = dateBox?.querySelector("span")?.textContent.trim() || "";
      const event = eventForRow(row, country, title);
      const sourceUrl = safeHttpUrl(event?.source || "");
      const actions = document.createElement("div"); actions.className = "research-row-actions";
      const savedItem = { kind: "event", title, country, date: [day, month, year].filter(Boolean).join(" "), sourceUrl, sourceModule: "Political Calendar" };
      const save = button(isSaved(savedItem) ? "✓ Saved" : "＋ Save evidence", "research-action", () => { const saved = addEvidence(savedItem); save.textContent = saved ? "✓ Saved" : "＋ Save evidence"; });
      const context = document.createElement("a"); context.className = "research-link"; context.href = "headlines.html?view=current&country=" + encodeURIComponent(country); context.textContent = "Country headlines ↗";
      actions.append(save, context);
      if (sourceUrl) { const source = document.createElement("a"); source.className = "research-link"; source.href = sourceUrl; source.target = "_blank"; source.rel = "noreferrer"; source.textContent = "Source ↗"; actions.append(source); }
      row.append(actions);
    });
  }

  function wireHeadlineRows() {
    document.querySelectorAll(".article").forEach((row) => {
      if (row.dataset.researchWired) return;
      row.dataset.researchWired = "true";
      const anchor = row.querySelector(".headline");
      const title = anchor?.textContent.trim() || "Country headline";
      const sourceUrl = safeHttpUrl(anchor?.href || "");
      const country = document.getElementById("countryname")?.textContent.trim() || "";
      const code = document.getElementById("countrycode")?.textContent.match(/ISO\s+([A-Z]{2,3})/)?.[1] || "";
      const published = row.querySelector(".source span:last-child")?.textContent.replace(/\s+UTC$/, "") || "";
      const item = { kind: "headline", title, country, countryCode: code, date: published, sourceUrl, domain: row.querySelector(".source span:first-child")?.textContent.trim() || "", sourceModule: "Country Headlines" };
      const actions = document.createElement("div"); actions.className = "research-row-actions";
      const save = button(isSaved(item) ? "✓ Saved" : "＋ Save evidence", "research-action", () => { const saved = addEvidence(item); save.textContent = saved ? "✓ Saved" : "＋ Save evidence"; });
      const context = document.createElement("a"); context.className = "research-link"; context.href = "calendar.html?period=contemporary&search=" + encodeURIComponent(country); context.textContent = "Calendar context ↗";
      actions.append(save, context); row.append(actions);
    });
  }

  function applyMapLayer() {
    const layerControl = document.querySelector(".map-layers");
    if (!layerControl) return;
    const mode = layerControl.dataset.mode || "coverage";
    const watchCodes = new Set(state.watchlist.map((item) => item.code).filter(Boolean));
    const evidenceCodes = new Set(state.evidence.filter((item) => item.kind === "headline").map((item) => item.countryCode).filter(Boolean));
    try {
      if (typeof geoLayer === "undefined" || !geoLayer || typeof countryIdentity !== "function") return;
      geoLayer.setStyle((feature) => {
        const identity = countryIdentity(feature.properties || {});
        const selectedCode = typeof selected !== "undefined" && selected?.code;
        const chosen = mode === "watchlist" ? watchCodes.has(identity.code) : mode === "evidence" ? evidenceCodes.has(identity.code) : true;
        return {
          fillColor: identity.code === selectedCode ? "#84aa68" : !chosen ? "#202d36" : mode === "evidence" ? "#4d9a92" : mode === "watchlist" ? "#8ba85b" : "#263b47",
          fillOpacity: chosen ? 0.9 : 0.2,
          color: chosen && (watchCodes.has(identity.code) || evidenceCodes.has(identity.code)) ? "#b7f36b" : "#647681",
          weight: chosen && (watchCodes.has(identity.code) || evidenceCodes.has(identity.code)) ? 1.5 : 0.6
        };
      });
    } catch { /* Map may not be ready yet. */ }
  }

  function observeSourceHealth() {
    const status = document.getElementById("status-news");
    if (!status || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      if (status.dataset.state === "ready") {
        state.sourceHealth.gdelt = { lastSuccessAt: new Date().toISOString() };
        persist();
      }
    });
    observer.observe(status, { attributes: true, childList: true, subtree: true, characterData: true });
  }

  function protectGdeltRateLimit() {
    if (!window.fetch || window.__jdpiqFetchGuard) return;
    const originalFetch = window.fetch.bind(window);
    window.__jdpiqFetchGuard = true;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (!url.includes("api.gdeltproject.org")) return originalFetch(input, init);
      const waitUntil = Number(state.gdeltCooldownUntil) || 0;
      if (waitUntil > Date.now()) {
        const error = new Error("GDELT rate limit cooldown is active"); error.status = 429;
        return Promise.reject(error);
      }
      return originalFetch(input, init).then((response) => {
        if (response.status === 429) {
          state.gdeltCooldownUntil = Date.now() + 15 * 60 * 1000;
          persist();
        } else if (response.ok) {
          state.gdeltCooldownUntil = 0;
          persist();
        }
        return response;
      });
    };
  }

  function applyCalendarSearch() {
    const searchValue = new URLSearchParams(location.search).get("search");
    const input = document.getElementById("search");
    if (searchValue && input) {
      input.value = searchValue;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function selectLinkedCountry(attempt = 0) {
    const wanted = new URLSearchParams(location.search).get("country");
    if (!wanted || !document.getElementById("countryname")) return;
    try {
      if (typeof geoLayer !== "undefined" && geoLayer && typeof countryIdentity === "function") {
        const layers = geoLayer.countryLayers || [];
        let found = null;
        if (layers.length) found = layers.find((layer) => countryIdentity(layer.feature?.properties || {}).name.toLowerCase() === wanted.toLowerCase());
        else if (geoLayer.eachLayer) geoLayer.eachLayer((layer) => { if (!found && countryIdentity(layer.feature?.properties || {}).name.toLowerCase() === wanted.toLowerCase()) found = layer; });
        if (found) {
          const id = countryIdentity(found.feature?.properties || {});
          if (typeof loadNews === "function" && id.code) loadNews(id.code, id.name);
          return;
        }
      }
    } catch { /* Boundary data may still be loading. */ }
    if (attempt < 100) { setTimeout(() => selectLinkedCountry(attempt + 1), 100); return; }
    const boundaryStatus = document.getElementById("status-boundaries")?.dataset.state;
    const countryName = document.getElementById("countryname");
    const countryCode = document.getElementById("countrycode");
    const newsState = document.getElementById("newsstate");
    const articles = document.getElementById("articles");
    if (countryName && newsState && articles && countryName.textContent === "Select a country") {
      countryName.textContent = wanted;
      countryCode.textContent = boundaryStatus === "ready" ? "Outside current map coverage" : "Map boundary status unavailable";
      newsState.textContent = boundaryStatus === "ready" ? "Country outside current coverage" : "Country could not be matched";
      articles.replaceChildren();
      const empty = document.createElement("div"); empty.className = "empty";
      empty.textContent = boundaryStatus === "ready" ? wanted + " is outside the Headlines module’s current country coverage." : "The country could not be matched because map boundaries are unavailable.";
      articles.append(empty);
    }
  }

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .research-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:8px 0 12px;padding:9px 11px;border:1px solid var(--line);border-radius:6px;background:#101c26}
      .research-toolbar-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.research-action{border:1px solid #34444e;border-radius:4px;background:#14212d;color:#cbd6d3;padding:6px 9px;font:10px 'DM Mono';cursor:pointer}.research-action:hover,.research-tab:hover{border-color:#799c59;color:#b7f36b}.research-freshness{color:#91a0aa;font:10px 'DM Mono';line-height:1.5}.research-row-actions{grid-column:2/-1;display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:4px}.research-link{color:#6ddac8;text-decoration:none;font:10px 'DM Mono';padding:4px 2px}.research-link:hover{text-decoration:underline}.research-current-watch[hidden]{display:none}.map-layers{position:absolute;z-index:700;top:12px;left:58px;display:flex;gap:5px;flex-wrap:wrap;max-width:calc(100% - 180px)}.map-layer{border:1px solid #34444e;border-radius:4px;background:#0d1721e8;color:#b8c4c5;padding:6px 8px;font:9px 'DM Mono';cursor:pointer}.map-layer.active{border-color:#799c59;color:#b7f36b;background:#14212df2}.research-drawer{position:fixed;inset:0 0 0 auto;margin:0 0 0 auto;width:min(620px,94vw);height:100dvh;max-height:none;border:0;border-left:1px solid #34444e;background:#101b25;color:#eff4f2;padding:0;box-shadow:-20px 0 60px #0008}.research-drawer::backdrop{background:#02070bb8}.research-drawer-header{display:flex;align-items:center;justify-content:space-between;padding:18px;border-bottom:1px solid #2a3a46;font:600 15px Manrope}.research-close{border:1px solid #34444e;background:transparent;color:#d3dddc;border-radius:4px;padding:6px 9px;cursor:pointer}.research-drawer-tabs{display:flex;gap:7px;padding:12px 18px;border-bottom:1px solid #2a3a46}.research-tab{border:1px solid #34444e;border-radius:4px;background:transparent;color:#91a0aa;padding:7px 10px;cursor:pointer;font:10px 'DM Mono'}.research-tab.active{color:#b7f36b;border-color:#799c59;background:#b7f36b12}.research-drawer-body{height:calc(100dvh - 116px);overflow:auto;padding:14px 18px}.research-card{display:grid;gap:8px;padding:13px 0;border-bottom:1px solid #2a3a46}.research-card strong{font:600 13px Manrope;line-height:1.45}.research-card-meta{color:#91a0aa;font:10px 'DM Mono'}.research-card-links{display:flex;gap:12px;flex-wrap:wrap}.research-note-label{color:#91a0aa;font:10px 'DM Mono';text-transform:uppercase;letter-spacing:.08em}.research-note{resize:vertical;min-height:48px;background:#0d1721;border:1px solid #34444e;border-radius:4px;color:#eff4f2;padding:8px;font:12px 'DM Sans'}.research-empty{color:#91a0aa;font-size:12px;line-height:1.6}.jdp-timeline .calendar{display:none}.jdp-timeline .eventlist{border-top:0}.jdp-timeline .eventrow{grid-template-columns:54px minmax(0,1fr);position:relative;padding:14px 0 14px 6px}.jdp-timeline .eventrow:before{content:'';position:absolute;left:26px;top:0;bottom:0;width:1px;background:#34444e}.jdp-timeline .eventrow:first-of-type:before{top:50%}.jdp-timeline .eventrow .datebox{position:relative;z-index:1;background:#14212d;padding-right:7px}.jdp-timeline .eventrow .tag{justify-self:start}.jdp-timeline .research-row-actions{grid-column:2/-1}@media(max-width:600px){.research-toolbar{align-items:flex-start}.research-freshness{width:100%}.map-layers{left:10px;top:52px;max-width:calc(100% - 20px)}.research-row-actions{gap:5px}.research-action{font-size:9px;padding:5px 7px}}
    `;
    document.head.append(style);
  }

  function boot() {
    addStyles();
    insertUi();
    protectGdeltRateLimit();
    observeSourceHealth();
    const observer = new MutationObserver(() => {
      wireCalendarRows(); wireHeadlineRows(); updateCurrentWatchButton(); updateTimelineButton(); applyMapLayer();
      document.querySelectorAll(".articles .empty span").forEach((detail) => {
        if (detail.textContent && !detail.dataset.redacted) {
          detail.textContent = "The source did not provide a safe diagnostic message. See the source status above.";
          detail.dataset.redacted = "true";
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("storage", (event) => {
      if (event.key === STORE_KEY) { state = readState(); renderToolbar(); renderDrawer(); applyMapLayer(); wireCalendarRows(); wireHeadlineRows(); }
    });
    wireCalendarRows(); wireHeadlineRows(); updateCurrentWatchButton(); applyMapLayer();
  }

  window.JDPIQResearchWorkspace = Object.freeze({
    toggleEvidence: addEvidence,
    toggleCountryWatchlist: addWatch,
    getState: () => JSON.parse(JSON.stringify(state)),
    enableGdeltRateLimitGuard: protectGdeltRateLimit
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
