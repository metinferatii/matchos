/*! Matchday OS embed. Usage:
 *  <script src="https://HOST/embed.js" data-match="wc22-final" data-lang="en"
 *          data-theme="dark|light" data-accent="#F5B425"></script>
 */
(function () {
  var script = document.currentScript || (function () {
    var all = document.querySelectorAll('script[src*="embed.js"]');
    return all[all.length - 1];
  })();
  if (!script || script.__mdos) return;
  script.__mdos = true;

  var origin = new URL(script.src, location.href).origin;
  var d = script.dataset;
  var match = d.match || "wc22-final";
  var lang = d.lang || "en";

  function userId() {
    var key = "mdos:userId";
    try {
      var v = localStorage.getItem(key);
      if (!v) { v = "fan-" + rand(); localStorage.setItem(key, v); }
      return v;
    } catch (e) { return "fan-" + rand(); }
  }
  function rand() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  var frameId = "mdos-" + Math.random().toString(36).slice(2, 9);
  var qs = new URLSearchParams({ match: match, lang: lang, userId: userId(), frame: frameId, embed: "1" });
  if (d.theme) qs.set("theme", d.theme);
  if (d.accent) qs.set("accent", d.accent);

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/widget.html?" + qs.toString();
  iframe.title = "Live match centre";
  // The widget is served from the Matchday OS origin, so allow-same-origin only gives it *its own*
  // origin (needed for fetch/WebSocket CORS with a real Origin header, and for storage); it never
  // gets access to the club page. Without it some browsers/extensions block the opaque-origin frame.
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
  iframe.setAttribute("loading", "eager");
  iframe.setAttribute("allow", "clipboard-write");
  iframe.style.cssText = "display:block;width:100%;max-width:" + (d.maxWidth || "720px") +
    ";height:560px;border:0;border-radius:16px;background:transparent;color-scheme:normal;overflow:hidden;transition:height .2s ease";
  script.parentNode.insertBefore(iframe, script.nextSibling);

  window.addEventListener("message", function (e) {
    if (e.source !== iframe.contentWindow || !e.data || e.data.mdos !== "height" || e.data.frame !== frameId) return;
    var h = Math.max(200, Math.min(4000, Math.ceil(+e.data.h || 0)));
    iframe.style.height = h + "px";
  });
})();
