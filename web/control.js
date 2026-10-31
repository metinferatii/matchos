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
  var ICON = {
    ingest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="m7 9 5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>',
    commentator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>',
    translator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h9"/><path d="M8.5 3v2"/><path d="M11 5c-1 4-3.5 7-7 9"/><path d="M6.5 9c1 2 3 3.5 5 4.5"/><path d="m13 21 4-9 4 9"/><path d="M14.5 18h5"/></svg>',
    stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 20v-6"/><path d="M12 20V5"/><path d="M19 20v-10"/></svg>',
    merch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.6" fill="currentColor"/></svg>',
    other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="7"/></svg>'
  };
  var AGENTS = {
    ingest: { c: "#5EC8F2", label: "ingest" },
    commentator: { c: "#F5B425", label: "commentator" },
    translator: { c: "#B794FF", label: "translator" },
    stats: { c: "#4FD18B", label: "stats" },
    merch: { c: "#FF7A8A", label: "merch" }
  };
  function agentOf(name) { return AGENTS[name] || { c: "#8C9BB5", label: name || "agent" }; }

  $("roster").innerHTML = Object.keys(AGENTS).map(function (k) {
    return '<span class="chip" id="chip-' + k + '" style="--c:' + AGENTS[k].c + '"><span class="av" style="--c:' + AGENTS[k].c + '">' + ICON[k] + "</span>" + k + "</span>";
  }).join("");

  var seenMsg = {};
  var lastFrom = null, lastTs = 0;
  var chat = $("chat");
  function msgKey(m) { return m.from + "|" + m.ts + "|" + m.text; }
  function renderEmpty() {
    if (!chat.children.length) chat.innerHTML = '<li class="empty">No agent messages yet. When the replay runs, ingest, commentator, translator, stats and merch post here as they hand work to each other.</li>';
  }
  function addAgentMsg(m, animate) {
    if (!m || !m.text) return;
    var k = msgKey(m);
    if (seenMsg[k]) return;
    seenMsg[k] = true;
    var empty = chat.querySelector(".empty");
    if (empty) empty.remove();
    var a = agentOf(m.from);
    var cont = m.from === lastFrom && m.ts - lastTs < 15000;
    lastFrom = m.from; lastTs = m.ts;
    var li = document.createElement("li");
    li.className = "msg" + (cont ? " cont" : "") + (animate ? " new" : "");
    li.style.setProperty("--c", a.c);
    var t = new Date(m.ts || Date.now());
    var time = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0") + ":" + String(t.getSeconds()).padStart(2, "0");
    var to = m.to && m.to !== "#match" ? '<span class="to">to ' + esc(m.to) + "</span>" : "";
    var text = esc(m.text).replace(/(^|\s)(@[a-z]+)/g, '$1<span class="mention">$2</span>');
    li.innerHTML = '<span class="av">' + (ICON[m.from] || ICON.other) + "</span><div>" +
      (cont ? "" : '<div class="mhead"><b>' + esc(a.label) + "</b>" + to + "<time>" + time + "</time></div>") +
      '<div class="mtext">' + text + "</div></div>";
    chat.appendChild(li);
    while (chat.children.length > 250) chat.removeChild(chat.firstChild);
    var nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 220;
    if (nearBottom || !animate) chat.scrollTop = chat.scrollHeight;
    var chip = $("chip-" + m.from);
    if (chip && animate) {
      chip.classList.add("active");
      clearTimeout(chip._t);
      chip._t = setTimeout(function () { chip.classList.remove("active"); }, 2500);
    }
  }
  function resetAgents(log) {
    chat.innerHTML = ""; seenMsg = {}; lastFrom = null;
    (log || []).forEach(function (m) { addAgentMsg(m, false); });
    renderEmpty();
  }
  renderEmpty();

  // ---------- Match data ----------
  var EVENTS = [], MATCH = null;
  var TYPE_LABEL = {
    kickoff: "Kick-off", half_end: "Whistle", goal: "Goal", shot_saved: "Shot saved", shot_missed: "Shot off target",
    penalty_awarded: "Penalty awarded", yellow_card: "Yellow card", red_card: "Red card", substitution: "Substitution",
    shootout_start: "Penalty shootout", shootout_goal: "Shootout: scored", shootout_miss: "Shootout: missed", full_time: "Full time"
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
  var ball = $("ballGroup"), trail = $("trail"), halo = $("halo");
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
    if (e.type === "yellow_card" || e.type === "red_card") return '<rect class="mk-card' + cls + '" x="' + (p[0] - .7) + '" y="' + (p[1] - 1) + '" width="1.4" height="2" fill="' + (e.type === "red_card" ? "#FF4D5E" : "#FFD43B") + '"/>';
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
    halo.setAttribute("opacity", isGoal ? 1 : 0);
    if (e.type === "goal") goalFlash(e);
    showCaption(e, idx);
  }

  function goalFlash(e) {
    var f = $("goalFlash");
    $("gfWho").textContent = e.player + " · " + e.team + "  " + e.score.home + "–" + e.score.away;
    f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
    var ts = document.querySelector(".tscore");
    ts.classList.remove("flash"); void ts.offsetWidth; ts.classList.add("flash");
  }

  function showCaption(e, idx) {
    var card = $("eventCard");
    card.classList.toggle("is-goal", !!e && (e.type === "goal" || e.type === "shootout_goal"));
    card.classList.toggle("is-card", !!e && /card/.test(e.type));
    if (!e) {
      $("evMin").textContent = "0'";
      $("evType").textContent = "Waiting for kick-off";
      $("evWho").innerHTML = "";
      $("evDetail").textContent = "Press Start, or Space, to begin the replay.";
      return;
    }
    $("evMin").textContent = e.clock === "PENS" ? "Pens" : e.clock;
    $("evType").textContent = TYPE_LABEL[e.type] || e.type;
    $("evWho").innerHTML = e.player ? '<span class="tflag">' + flagSvg(e.team) + "</span>" + esc(e.player) + ' <span style="color:var(--mist);font-weight:500">' + esc(e.team || "") + "</span>" : "";
    var detail = e.detail;
    if (e.shootout && e.period === 5) detail += " · shootout " + e.shootout.home + "–" + e.shootout.away;
    $("evDetail").textContent = detail;
    ["evMin", "evType", "evWho", "evDetail"].forEach(function (id) { var el = $(id); el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap"); });
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
    $("tMin").textContent = s.minute === "0'" ? "Pre-match" : s.minute === "PENS" ? "Pens" : s.minute;
    var pens = s.minute === "PENS" && s.shootout;
    $("tPens").hidden = !pens;
    if (pens) $("tPens").textContent = "Pens " + s.shootout.home + "–" + s.shootout.away;
    var play = $("btnPlay");
    play.textContent = s.running ? "Pause" : (s.cursor >= s.total ? "Finished" : "Start");
    play.classList.toggle("running", !!s.running);
    document.querySelectorAll("#speed button").forEach(function (b) { b.classList.toggle("on", +b.dataset.ms === s.tickMs); });
    $("stEvent").textContent = s.cursor + " / " + s.total;
    var votes = 0; Object.keys(s.predictions || {}).forEach(function (k) { votes += s.predictions[k]; });
    $("stVotes").textContent = votes;
    $("stOrders").textContent = s.orders || 0;
    var o = s.offer, offerEl = $("stOffer");
    if (o && o.expiresAt > Date.now()) {
      var left = Math.ceil((o.expiresAt - Date.now()) / 1000);
      offerEl.innerHTML = "<b>" + esc(o.player) + " −" + o.discountPct + "% · " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0") + "</b><span>flash offer live</span>";
      offerEl.classList.add("live");
    } else {
      offerEl.innerHTML = "<b>No offer live</b><span>merch agent</span>";
      offerEl.classList.remove("live");
    }

    if (!EVENTS.length) return;
    var cur = s.cursor;
    if (cur !== shownCursor) {
      if (shownCursor < 0 || cur < shownCursor || cur - shownCursor > 3) {
        // reset, jump or first load: place without fanfare
        animToken++;
        rebuildMarkers(cur);
        moveBall(lastPointBefore(cur), true);
        trail.style.opacity = 0;
        halo.setAttribute("opacity", 0);
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
    $("matchName").textContent = m.competition + " · " + m.venue;
    $("tHome").textContent = m.home.short; $("tAway").textContent = m.away.short;
    $("tHomeFlag").innerHTML = flagSvg(m.home.name); $("tAwayFlag").innerHTML = flagSvg(m.away.name);
    $("dirHome").innerHTML = flagSvg(m.home.name); $("dirAway").innerHTML = flagSvg(m.away.name);
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
  var LANG_NAME = { en: "English", sq: "Shqip", es: "Español", ar: "العربية" };
  function fitFrame(screen, iframe, baseW) {
    var w = screen.clientWidth, h = screen.clientHeight;
    if (!w || !h) return;
    var scale = w / baseW;
    iframe.style.width = baseW + "px";
    iframe.style.height = Math.ceil(h / scale) + "px";
    iframe.style.transform = "scale(" + scale + ")";
  }
  // phones take their width from the row height (390x800-ish screens)
  var surfaces = document.querySelector(".surfaces");
  new ResizeObserver(function () {
    var h = surfaces.clientHeight - 34; // minus caption
    surfaces.style.setProperty("--phone-w", Math.round(Math.max(200, h * 0.5)) + "px");
  }).observe(surfaces);

  var club = $("clubFrame");
  // land the club site on its live match centre so the embed is in view
  club.addEventListener("load", function () {
    try {
      var doc = club.contentDocument;
      var target = doc.querySelector("main");
      if (target) club.contentWindow.scrollTo(0, target.getBoundingClientRect().top + club.contentWindow.scrollY - 16);
    } catch (e) {}
  });
  new ResizeObserver(function () { fitFrame($("clubScreen"), club, 1280); }).observe($("clubScreen"));

  document.querySelectorAll(".surface.phone").forEach(function (fig) {
    var screen = fig.querySelector(".screen");
    var iframe = fig.querySelector("iframe");
    function setLang(lang) {
      fig.dataset.lang = lang;
      iframe.src = "widget.html?" + new URLSearchParams({ match: MATCH_ID, lang: lang, userId: iframe.dataset.user + "-" + lang, fill: "1" });
      fig.querySelector(".lname").textContent = LANG_NAME[lang] + " fan";
      fig.querySelectorAll(".langs button").forEach(function (b) { b.classList.toggle("on", b.dataset.lang === lang); });
    }
    fig.querySelector(".langs").innerHTML = ["sq", "es", "ar", "en"].map(function (l) { return '<button type="button" data-lang="' + l + '">' + l + "</button>"; }).join("");
    fig.querySelector(".langs").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (b && b.dataset.lang !== fig.dataset.lang) setLang(b.dataset.lang);
    });
    setLang(fig.dataset.lang);
    new ResizeObserver(function () { fitFrame(screen, iframe, 360); }).observe(screen);
  });
})();
