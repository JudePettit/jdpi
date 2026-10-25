(function (global, document) {
  "use strict";

  const config = global.JDPIQ_OBSERVABILITY_CONFIG || {};
  const script = document.currentScript;
  const moduleName = (script?.dataset.module || "JDP-I Q Suite").slice(0, 80);
  const release = String(config.release || "unknown").slice(0, 80);
  const host = String(config.posthogHost || "https://eu.i.posthog.com").replace(/\/$/, "");
  const token = String(config.posthogProjectToken || "").trim();
  let client = null;
  const pendingErrors = [];
  const seenErrors = new WeakSet();

  function safePath() {
    return String(global.location?.pathname || "/").split(/[?#]/, 1)[0].slice(0, 300);
  }

  function scrub(value) {
    return String(value || "")
      .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
      .replace(/([?&](?:token|api[_-]?key|secret|password|authorization)=)[^&#\s]*/gi, "$1[redacted]")
      .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/gi, "$1")
      .slice(0, 8000);
  }

  function safeError(error) {
    if (error instanceof Error) {
      const result = new Error(scrub(error.message || error.name || "Application error"));
      result.name = scrub(error.name || "Error").slice(0, 120);
      if (error.stack) result.stack = scrub(error.stack);
      return result;
    }
    return new Error(scrub(error).slice(0, 800));
  }

  function sendError(error, source) {
    const safe = safeError(error);
    const item = { error: safe, source: String(source || "runtime").slice(0, 80) };
    if (client?.captureException) {
      client.captureException(item.error, {
        module: moduleName,
        release,
          path: safePath(),
        source: item.source
      });
    } else if (pendingErrors.length < 10) {
      pendingErrors.push(item);
    }
  }

  global.addEventListener("error", function (event) {
    const error = event.error || event.message;
    if (error && typeof error === "object") {
      if (seenErrors.has(error)) return;
      seenErrors.add(error);
    }
    sendError(error, "window.error");
  });

  global.addEventListener("unhandledrejection", function (event) {
    const error = event.reason;
    if (error && typeof error === "object") {
      if (seenErrors.has(error)) return;
      seenErrors.add(error);
    }
    sendError(error, "unhandledrejection");
  });

  function bootPostHog() {
    if (!token || !/^https:\/\/[a-z0-9.-]+\.i\.posthog\.com$/i.test(host)) return false;
    if (global.location?.protocol === "file:") return false;

    // Official PostHog HTML bootstrap: the project token is a public browser
    // token; no privileged API or Better Stack credentials are sent here.
    !function (t, e) {
      var o, n, p, r;
      e.__SV || (global.posthog = e, e._i = [], e.init = function (i, s, a) {
        function g(t, e) {
          var o = e.split(".");
          2 == o.length && (t = t[o[0]], e = o[1]);
          t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); };
        }
        (p = t.createElement("script")).type = "text/javascript";
        p.crossOrigin = "anonymous";
        p.async = !0;
        p.src = s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js";
        (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r);
        var u = e;
        void 0 !== a ? u = e[a] = [] : a = "posthog";
        u.people = u.people || [];
        u.toString = function (t) { var e = "posthog"; return "posthog" !== a && (e += "." + a), t || (e += " (stub)"), e; };
        u.people.toString = function () { return u.toString(1) + ".people (stub)"; };
        o = "init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" ");
        for (n = 0; n < o.length; n++) g(u, o[n]);
        e._i.push([i, s, a]);
      }, e.__SV = 1);
    }(document, global.posthog || {});

    global.posthog.init(token, {
      api_host: host,
      defaults: "2026-08-30",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      loaded: function (posthog) {
        client = posthog;
        posthog.capture("$pageview", {
          module: moduleName,
          release,
          "$current_url": scrub(global.location.origin + safePath())
        });
        while (pendingErrors.length) {
          const item = pendingErrors.shift();
          posthog.captureException(item.error, {
            module: moduleName,
            release,
            path: safePath(),
            source: item.source
          });
        }
      }
    });
    return true;
  }

  const enabled = bootPostHog();
  global.JDPIQObservability = Object.freeze({
    enabled,
    module: moduleName,
    captureException: sendError
  });
})(window, document);
