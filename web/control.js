/* Matchday OS control room */
(function () {
  "use strict";
  var MATCH_ID = new URLSearchParams(location.search).get("match") || "wc22-final";
  var API = location.origin;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function flagSvg(team) {
    if (team === "Argentina") return '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#75AADB"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><circle cx="15" cy="10" r="2.1" fill="#F6B40E"/></svg>';
    if (team === "France") return '<svg viewBox="0 0 30 20"><rect width="10" height="20" fill="#0055A4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#EF4135"/></svg>';
    return '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#556"/></svg>';
  }

  // ---------- Agents ----------
  // One desaturated hue per agent; the accent stays reserved for goals and actions.
  var AGENTS = {
    ingest: { c: "#8fb0c0", label: "ingest" },
    commentator: { c: "#d3bc8f", label: "commentator" },
    translator: { c: "#ad9fc9", label: "translator" },
    stats: { c: "#93bb9c", label: "stats" },
    merch: { c: "#cc9c9c", label: "merch" },
    producer: { c: "#b4bf91", label: "producer" },
    "club-ops": { c: "#9fb7b0", label: "club-ops" },
    crowd: { c: "#c3a7bb", label: "crowd" }
  };
  // hired agents ("translator-ja") take their base role's hue
  function agentOf(name) {
    var base = name && AGENTS[name] || name && AGENTS[String(name).split("-")[0]];
    return { c: base ? base.c : "#a6a3a0", label: name || "agent" };
  }
  function countAgent() {}

  // ---------- Roster ----------
  var rosterSeen = null;
  function hhmm(ts) { var d = new Date(ts); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function renderRoster(list) {
    if (!Array.isArray(list)) return;
    var first = rosterSeen === null;
    var seenNow = {};
    $("roster").innerHTML = list.map(function (r) {
      seenNow[r.name] = true;
      var fresh = !first && !rosterSeen[r.name];
      var hired = r.hiredBy ? "hired by " + esc(r.hiredBy) + (r.hiredAt ? " · " + hhmm(r.hiredAt) : "") : "";
      return '<li class="' + (r.status === "working" ? "working" : "") + (fresh ? " new" : "") + (r.hiredBy ? " hired" : "") + '">' +
        '<span class="st" title="' + esc(r.status || "idle") + '"></span>' +
        '<b style="color:' + agentOf(r.name).c + '">' + esc(r.name) + "</b>" +
        '<span class="role">' + esc(r.role || "") + "</span>" +
        '<span class="hb">' + hired + "</span></li>";
    }).join("");
    rosterSeen = seenNow;
  }
  var FLAG_LANG = { "\u{1F1E6}\u{1F1F1}": "sq", "\u{1F1EA}\u{1F1F8}": "es", "\u{1F1F8}\u{1F1E6}": "ar", "\u{1F1EC}\u{1F1E7}": "en" };
  var PICTO = /[\u{1F1E6}-\u{1F1FF}]|\p{Extended_Pictographic}|\uFE0F|\u200D/gu;
  function agentText(raw) {
    var t = String(raw);
    // translator posts "flag text · flag text ..."; show one line per language with a plain code
    // newer format: "sq: text · es: text · ar: text"
    if (/^[a-z]{2}:\s/.test(t)) {
      return t.split(/\s+·\s+(?=[a-z]{2}:\s)/).map(function (p) {
        var m = p.match(/^([a-z]{2}):\s*/);
        return '<span class="tr"><span class="lc">' + m[1] + '</span><span dir="auto">' + mention(esc(p.slice(m[0].length).replace(PICTO, "").trim())) + "</span></span>";
      }).join("");
    }
    var parts = t.split(/\s+·\s+(?=[\u{1F1E6}-\u{1F1FF}])/u);
    if (parts.length > 1 || /^[\u{1F1E6}-\u{1F1FF}]{2}/u.test(t)) {
      return parts.map(function (p) {
        var m = p.match(/^([\u{1F1E6}-\u{1F1FF}]{2})\s*/u);
        var code = m ? (FLAG_LANG[m[1]] || "") : "";
        var body = (m ? p.slice(m[0].length) : p).replace(PICTO, "").trim();
        return '<span class="tr"><span class="lc">' + code + '</span><span dir="auto">' + mention(esc(body)) + "</span></span>";
      }).join("");
    }
    return mention(esc(t.replace(PICTO, "").replace(/\s{2,}/g, " ").trim()));
  }
  function mention(h) {
    return h.replace(/(^|\s)@([a-z]+)/g, function (_, sp, n) { return sp + '<span class="mention" style="--c-to:' + agentOf(n).c + '">' + n + "</span>"; });
  }

  var seenMsg = {};
  var lastFrom = null, lastTo = null, lastKind = "", lastTs = 0;
  var chat = $("chat");
  function msgKey(m) { return m.from + "|" + m.ts + "|" + m.text; }
  function renderEmpty() {
    if (!chat.children.length) chat.innerHTML = '<li class="empty">Quiet before kick-off. Once the replay starts, the producer briefs the team and every hand-off shows up here.</li>';
  }
  function addAgentMsg(m, animate) {
    if (!m || !m.text) return;
    var k = msgKey(m);
    if (seenMsg[k]) return;
    seenMsg[k] = true;
    var empty = chat.querySelector(".empty");
    if (empty) empty.remove();
    var a = agentOf(m.from);
    var toName = m.to ? String(m.to).replace(/^@/, "") : "#match";
    var cont = m.from === lastFrom && m.to === lastTo && (m.kind || "") === lastKind && m.ts - lastTs < 15000;
    lastFrom = m.from; lastTo = m.to; lastKind = m.kind || ""; lastTs = m.ts;
    var li = document.createElement("li");
    li.className = "msg" + (cont ? " cont" : "") + (animate ? " new" : "") + (m.kind ? " k-" + m.kind : "");
    li.style.setProperty("--c", a.c);
    var t = new Date(m.ts || Date.now());
    var time = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0") + ":" + String(t.getSeconds()).padStart(2, "0");
    countAgent(m.from);
    var toAgent = AGENTS[toName] || AGENTS[toName.replace(/s$/, "")] || AGENTS[toName.split("-")[0]];
    var to = '<span class="arrow">→</span><span class="to"' + (toAgent ? ' style="color:' + toAgent.c + '"' : "") + ">" + esc(toName) + "</span>" +
      (m.kind ? '<span class="kind">· ' + esc(m.kind) + "</span>" : "");
    li.innerHTML = (cont ? "" : '<div class="mhead"><b>' + esc(a.label) + "</b>" + to + "<time>" + time + "</time></div>") +
      '<div class="mtext">' + agentText(m.text) + "</div>";
    var nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 220;
    chat.appendChild(li);
    while (chat.children.length > 250) chat.removeChild(chat.firstChild);
    if (nearBottom || !animate) chat.scrollTop = chat.scrollHeight;
  }
  function resetAgents(log) {
    chat.innerHTML = ""; seenMsg = {}; lastFrom = null; lastTo = null;
    (log || []).forEach(function (m) { addAgentMsg(m, false); });
    renderEmpty();
  }
  renderEmpty();

  // ---------- Match data ----------
  var EVENTS = [], MATCH = null;
  var TYPE_LABEL = {
    kickoff: "Kick-off", half_end: "Whistle", goal: "Goal", shot_saved: "Shot saved", shot_missed: "Shot off target",
    penalty_awarded: "Penalty awarded", yellow_card: "Yellow card", red_card: "Red card", substitution: "Substitution",
    shootout_start: "Penalty shootout", shootout_goal: "Penalty scored", shootout_miss: "Penalty missed", full_time: "Full time"
  };

  function pitchPoint(e) {
    if (!e) return null;
    var home = MATCH ? MATCH.home.name : "Argentina";
    if (e.type === "half_end" || e.type === "full_time" || e.type === "kickoff" || e.type === "shootout_start") return [60, 40];
    if (e.type === "penalty_awarded") return e.team === home ? [12, 40] : [108, 40]; // the fouling team's own box
    if (!e.location) return null;
    var x = e.location[0], y = e.location[1];
    if (e.period === 5) return [x, y]; // shootout: all kicks at one end
    if (e.team && e.team !== home) { x = 120 - x; y = 80 - y; }
    return [x, y];
  }

  // ---------- Pitch ----------
  var ball = $("ballGroup"), trail = $("trail");
  var ballPos = [60, 40];
  var animToken = 0;
  function moveBall(p, instant, cls) {
    ball.classList.toggle("instant", !!instant);
    ball.classList.toggle("into", cls === "into");
    if (instant) void ball.getBoundingClientRect();
    ball.style.transform = "translate(" + p[0] + "px," + p[1] + "px)";
    ballPos = p;
  }
  function markerFor(e, fresh) {
    var p = pitchPoint(e);
    if (!p || e.period === 5) return "";
    var cls = fresh ? " mk-new" : "";
    if (e.type === "goal") return '<circle class="mk-goal' + cls + '" cx="' + p[0] + '" cy="' + p[1] + '" r="1.6"/>';
    if (e.type === "shot_saved") return '<circle class="mk-saved' + cls + '" cx="' + p[0] + '" cy="' + p[1] + '" r="1.1"/>';
    if (e.type === "shot_missed") return '<circle class="mk-shot' + cls + '" cx="' + p[0] + '" cy="' + p[1] + '" r="1.1"/>';
    if (e.type === "yellow_card" || e.type === "red_card") return '<rect class="mk-card' + cls + '" x="' + (p[0] - .6) + '" y="' + (p[1] - .9) + '" width="1.2" height="1.8" fill="' + (e.type === "red_card" ? "#ce4d53" : "#d9c36a") + '"/>';
    return "";
  }
  function rebuildMarkers(upto) {
    $("markers").innerHTML = EVENTS.slice(0, upto).map(function (e) { return markerFor(e, false); }).join("");
  }
  function lastPointBefore(i) {
    for (var j = i - 1; j >= 0; j--) { var p = pitchPoint(EVENTS[j]); if (p) return p; }
    return [60, 40];
  }

  function playEvent(e, idx) {
    var token = ++animToken;
    var p = pitchPoint(e);
    var mk = markerFor(e, true);
    if (mk) $("markers").insertAdjacentHTML("beforeend", mk);
    if (p) {
      trail.setAttribute("x1", ballPos[0]); trail.setAttribute("y1", ballPos[1]);
      trail.setAttribute("x2", p[0]); trail.setAttribute("y2", p[1]);
      trail.style.opacity = 1;
      moveBall(p, false);
      setTimeout(function () { if (token === animToken) trail.style.opacity = 0; }, 1400);
    }
    var isGoal = e.type === "goal" || e.type === "shootout_goal";
    if (isGoal && p) {
      setTimeout(function () {
        if (token !== animToken) return;
        var home = MATCH ? MATCH.home.name : "Argentina";
        var right = e.period === 5 || e.team === home;
        moveBall([right ? 121.2 : -1.2, 38 + (p[1] - 40) * 0.08], false, "into");
      }, 750);
    }
    if (e.type === "goal") goalFlash(e);
    showCaption(e, idx);
  }

  var flashT = null;
  function goalFlash() {
    var ts = $("tScore");
    ts.classList.add("flash");
    clearTimeout(flashT);
    flashT = setTimeout(function () { ts.classList.remove("flash"); }, 4000);
  }

  function showCaption(e, idx) {
    var card = $("eventCard");
    card.classList.toggle("is-goal", !!e && (e.type === "goal" || e.type === "shootout_goal"));
    renderRecent(idx);
    if (!e) {
      $("evMin").textContent = "0'";
      $("evType").textContent = "Waiting for kick-off";
      $("evWho").innerHTML = "";
      $("evDetail").textContent = "Press Space to start the replay.";
      return;
    }
    $("evMin").textContent = e.clock === "PENS" ? "Pens" : e.clock;
    var label = TYPE_LABEL[e.type] || e.type;
    if (e.type === "goal") label += ", " + e.score.home + "–" + e.score.away;
    $("evType").textContent = label;
    $("evWho").innerHTML = e.player ? esc(e.player) + ' <span class="team">' + esc(e.team || "") + "</span>" : "";
    var detail = e.detail;
    if (e.shootout && e.period === 5) detail += ", shootout " + e.shootout.home + "–" + e.shootout.away;
    $("evDetail").textContent = detail;
  }
  function renderRecent(idx) {
    var out = [];
    for (var i = idx - 1; i >= 0 && out.length < 12; i--) {
      var e = EVENTS[i];
      var what = (TYPE_LABEL[e.type] || e.type) + (e.player ? ", " + e.player : "");
      out.push('<li class="' + (e.type === "goal" ? "goal" : "") + '"><span class="m">' + esc(e.clock === "PENS" ? "Pens" : e.clock) + "</span><span>" + esc(what) + "</span></li>");
    }
    $("recent").innerHTML = out.join("");
  }

  // ---------- Timeline ----------
  function buildTimeline() {
    var html = [];
    EVENTS.forEach(function (e, i) {
      if (e.type === "kickoff" && i > 0) html.push('<button class="half" disabled tabindex="-1" aria-hidden="true"></button>');
      var cls = e.type === "goal" ? "goal" : "";
      html.push('<button type="button" data-i="' + i + '" class="' + cls + '" title="' + esc(e.clock + " " + (TYPE_LABEL[e.type] || e.type) + (e.player ? " · " + e.player : "")) + '"></button>');
    });
    $("timeline").innerHTML = html.join("");
  }
  function paintTimeline(cur) {
    $("timeline").querySelectorAll("button[data-i]").forEach(function (b) {
      var i = +b.dataset.i;
      b.classList.toggle("done", i < cur);
      b.classList.toggle("now", i === cur - 1);
    });
  }
  $("timeline").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-i]");
    if (!b || !st) return;
    var target = +b.dataset.i, wasRunning = st.running;
    // jumping backwards would leave later commentary in the feeds, so start clean first
    var go = target < st.cursor ? control("reset").then(function () { return control("jump", target); }) : control("jump", target);
    go.then(function () { if (wasRunning && st && !st.running) control("start", speed()); });
  });

  // ---------- State polling ----------
  var shownCursor = -1;
  var lastScore = null;
  var st = null;
  function applyState(s) {
    st = s;
    $("tHs").textContent = s.score.home;
    $("tAs").textContent = s.score.away;
    $("tMin").textContent = s.clock === "0'" ? "Pre-match" : s.clock === "PENS" ? "Penalties" : s.clock;
    var pens = s.clock === "PENS" && s.shootout;
    $("tPens").hidden = !pens;
    if (pens) $("tPens").textContent = s.shootout.home + "–" + s.shootout.away;
    $("liveDot").classList.toggle("on", !!s.running);
    if (Array.isArray(s.roster)) { $("agentCount").textContent = s.roster.length + " agents"; renderRoster(s.roster); }
    if (Array.isArray(s.languages)) $("langCount").textContent = s.languages.length + " languages";
    var play = $("btnPlay");
    play.textContent = s.running ? "Pause" : (s.cursor >= s.total ? "Finished" : "Start");
    play.classList.toggle("running", !!s.running);
    document.querySelectorAll("#speed button").forEach(function (b) { b.classList.toggle("on", +b.dataset.ms === s.tickMs); });

    if (!EVENTS.length) return;
    var cur = s.cursor;
    if (cur !== shownCursor) {
      if (shownCursor < 0 || cur < shownCursor || cur - shownCursor > 3) {
        // reset, jump or first load: place without fanfare
        animToken++;
        rebuildMarkers(cur);
        moveBall(lastPointBefore(cur), true);
        trail.style.opacity = 0;
        showCaption(EVENTS[cur - 1] || null, cur - 1);
        if (cur < shownCursor || cur === 0) resetAgentsFromState(s);
      } else {
        for (var i = shownCursor; i < cur; i++) {
          if (i < cur - 1) { var mk = markerFor(EVENTS[i], false); if (mk) $("markers").insertAdjacentHTML("beforeend", mk); }
          else playEvent(EVENTS[i], i);
        }
      }
      shownCursor = cur;
      paintTimeline(cur);
    }
    // agent log from polling, in case the socket is down
    (s.agentLog || []).forEach(function (m) { addAgentMsg(m, shownCursor >= 0); });
  }
  var lastAgentSig = "";
  function resetAgentsFromState(s) {
    var sig = (s.agentLog || []).length + ":" + s.cursor;
    if (sig === lastAgentSig) return;
    lastAgentSig = sig;
    resetAgents(s.agentLog);
  }

  var apiOk = null;
  function setApi(ok) {
    if (ok === apiOk) return;
    apiOk = ok;
    $("connApi").className = "conn " + (ok ? "ok" : "wait");
  }
  var polling = false;
  function poll() {
    if (polling) return;
    polling = true;
    fetch(API + "/api/state?match=" + MATCH_ID, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (s) {
      if (s && s.score) { setApi(true); applyState(s); } else setApi(false);
    }).catch(function () { setApi(false); }).then(function () { polling = false; });
  }

  fetch(API + "/match.json").then(function (r) { return r.json(); }).then(function (m) {
    MATCH = m; EVENTS = m.events;
    $("tHome").textContent = m.home.name; $("tAway").textContent = m.away.name;
    $("dirHomeName").textContent = m.home.name; $("dirAwayName").textContent = m.away.name;
    buildTimeline();
    // seed agents from the log on first load
    fetch(API + "/api/state?match=" + MATCH_ID).then(function (r) { return r.json(); }).then(function (s) {
      resetAgents(s.agentLog); lastAgentSig = (s.agentLog || []).length + ":" + s.cursor;
      setApi(true); applyState(s);
    }).catch(function () { setApi(false); });
  });
  setInterval(poll, 500);

  // ---------- Socket for live agent messages ----------
  var ws = null, retryT = null;
  function setWs(state) { $("connWs").className = "conn " + state; }
  function connect() {
    clearTimeout(retryT);
    setWs("wait");
    fetch(API + "/connect?match=" + MATCH_ID + "&userId=control-room&lang=en").then(function (r) { return r.json(); }).then(function (j) {
      var s = new WebSocket(j.websocketUrl);
      ws = s;
      s.onopen = function () { setWs("ok"); };
      s.onmessage = function (e) {
        var m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.type === "agent") addAgentMsg(m.msg, true);
        else if (m.type === "score" || m.type === "state") poll();
      };
      s.onclose = function () { if (ws === s) { ws = null; setWs("wait"); retryT = setTimeout(connect, 1000); } };
      s.onerror = function () { try { s.close(); } catch (err) {} };
    }).catch(function () { setWs("wait"); retryT = setTimeout(connect, 1000); });
  }
  connect();

  // ---------- Controls ----------
  function control(action, value) {
    var q = "match=" + MATCH_ID + "&action=" + action + (value != null ? "&value=" + value : "");
    return fetch(API + "/api/control?" + q, { method: "POST" }).then(function (r) { return r.json(); }).then(function (s) {
      if (s && s.score) applyState(s);
      return s;
    }).catch(function () {});
  }
  function speed() { return st ? st.tickMs : 4000; }
  function togglePlay() {
    if (!st) return;
    if (st.running) control("pause");
    else if (st.cursor < st.total) control("start", speed());
  }
  function nextGoal() {
    if (!st || !EVENTS.length) return;
    var from = st.cursor;
    var i = -1;
    for (var j = from; j < EVENTS.length; j++) if (EVENTS[j].type === "goal") { i = j; break; }
    if (i < 0) for (j = from; j < EVENTS.length; j++) if (EVENTS[j].type === "shootout_start") { i = j; break; }
    if (i < 0) return;
    var target = Math.max(from, i - 2);
    control("jump", target).then(function () { if (!st.running) control("start", speed()); });
  }
  $("btnPlay").addEventListener("click", togglePlay);
  $("btnGoal").addEventListener("click", nextGoal);
  $("btnReset").addEventListener("click", function () { control("reset"); });
  $("speed").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    control("speed", +b.dataset.ms);
  });
  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input, textarea")) return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.key === "g" || e.key === "G") nextGoal();
    else if (e.key === "R" && e.shiftKey) control("reset");
  });

  // ---------- Surfaces ----------
  var LANG_NAME = { en: "English", sq: "Shqip", es: "Español", ar: "العربية", ja: "日本語", fr: "Français", de: "Deutsch", tr: "Türkçe" };
  var ALL_LANGS = ["en", "sq", "es", "ar", "ja", "fr", "de", "tr"];
  function fitFrame(screen, iframe, baseW) {
    var w = screen.clientWidth, h = screen.clientHeight;
    if (!w || !h) return;
    var scale = w / baseW;
    iframe.style.width = baseW + "px";
    iframe.style.height = Math.ceil(h / scale) + "px";
    iframe.style.transform = "scale(" + scale + ")";
  }
  // phones take their size from the row height, capped by the column width
  var phones = document.querySelector(".phones");
  function sizePhones() {
    var n = phones.querySelectorAll(".phone").length || 1;
    var h = phones.clientHeight - 30; // minus caption
    var w = Math.min(h * 0.5, (phones.clientWidth - 24 * (n - 1)) / n);
    phones.style.setProperty("--phone-w", Math.round(Math.max(120, w)) + "px");
  }
  new ResizeObserver(sizePhones).observe(phones);
  function updateSurfaceCount() { $("surfCount").textContent = (1 + phones.querySelectorAll(".phone").length) + " fan surfaces"; }

  var club = $("clubFrame");
  // land the club site on its live match centre so the embed is in view
  club.addEventListener("load", function () {
    try {
      var doc = club.contentDocument;
      var target = doc.querySelector(".body");
      if (target) club.contentWindow.scrollTo(0, target.getBoundingClientRect().top + club.contentWindow.scrollY + 16);
    } catch (e) {}
  });
  new ResizeObserver(function () { fitFrame($("clubScreen"), club, 1100); }).observe($("clubScreen"));

  function setupPhone(fig) {
    var screen = fig.querySelector(".screen");
    var iframe = fig.querySelector("iframe");
    function setLang(lang) {
      fig.dataset.lang = lang;
      iframe.src = "widget.html?" + new URLSearchParams({ match: MATCH_ID, lang: lang, userId: iframe.dataset.user + "-" + lang, fill: "1" });
      fig.querySelector(".lname").textContent = LANG_NAME[lang] || lang;
      fig.querySelectorAll(".langs button").forEach(function (b) { b.classList.toggle("on", b.dataset.lang === lang); });
    }
    fig.querySelector(".langs").innerHTML = ALL_LANGS.map(function (l) { return '<button type="button" data-lang="' + l + '">' + l + "</button>"; }).join("");
    fig.querySelector(".langs").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (b && b.dataset.lang !== fig.dataset.lang) setLang(b.dataset.lang);
    });
    fig._setLang = setLang;
    setLang(fig.dataset.lang);
    new ResizeObserver(function () { fitFrame(screen, iframe, 360); }).observe(screen);
  }
  document.querySelectorAll(".surface.phone").forEach(setupPhone);
  updateSurfaceCount();

  // Operator: add a fan in any language. A third phone joins the stage when it fits;
  // otherwise the newest fan takes over the second phone.
  $("fanLang").innerHTML = ALL_LANGS.map(function (l) { return '<option value="' + l + '"' + (l === "ja" ? " selected" : "") + ">" + l + "</option>"; }).join("");
  $("btnFan").addEventListener("click", function () {
    var lang = $("fanLang").value;
    var list = phones.querySelectorAll(".phone");
    var fits = (phones.clientWidth - 48) / 3 >= 170;
    if (list.length < 3 && fits) {
      var fig = document.createElement("figure");
      fig.className = "surface phone added";
      fig.dataset.lang = lang;
      fig.innerHTML = '<div class="device"><div class="screen"><iframe title="Fan widget" data-user="stage-phone-' + (list.length + 1) + '"></iframe></div></div>' +
        '<figcaption><span>Phone</span><span class="lang lname"></span><span class="langs"></span></figcaption>';
      phones.appendChild(fig);
      sizePhones();
      setupPhone(fig);
      updateSurfaceCount();
    } else {
      var last = list[list.length - 1];
      last.querySelector("iframe").dataset.user = "stage-phone-new";
      last._setLang(lang);
      last.classList.remove("added"); void last.offsetWidth; last.classList.add("added");
    }
  });
})();
