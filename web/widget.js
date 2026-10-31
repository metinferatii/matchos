/* Matchday OS fan widget. Plain JS, no build step. */
(function () {
  "use strict";

  // ---------- Params ----------
  var P = new URLSearchParams(location.search);
  var LANGS = ["en", "sq", "es", "ar"];
  var lang = LANGS.indexOf(P.get("lang")) >= 0 ? P.get("lang") : "en";
  var match = P.get("match") || "wc22-final";
  var frameId = P.get("frame") || "";
  var embedded = P.get("embed") === "1";
  var fill = P.get("fill") === "1";
  var userId = P.get("userId") || storedId();
  var API = location.protocol + "//" + location.host;

  function storedId() {
    try {
      var v = localStorage.getItem("mdos:userId");
      if (!v) { v = "fan-" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("mdos:userId", v); }
      return v;
    } catch (e) { return "fan-" + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  }

  // ---------- Strings ----------
  var STR = {
    en: {
      teams: { Argentina: "Argentina", France: "France" },
      live: "Live", feedSub: "AI commentary", predict: "Who scores next?", hint: "Tap a player to make your call.",
      votes: function (n) { return n === 1 ? "1 vote" : n + " votes"; }, noVotes: "No calls yet",
      ask: "Ask", askPh: "Ask anything about this match", youAsked: "You asked", answer: "Answer for you",
      thinking: "Thinking…", goal: "Goal", update: "Update",
      flash: "Flash offer", endsIn: "Ends in", buy: "Buy now", buying: "Ordering…", later: "Not now",
      ordered: "Order received. Confirmation is on its way.", expired: "This offer has ended.",
      off: "Subbed off", pens: "Penalties", pensMin: "Pens", pre: "Pre-match",
      reconnecting: "Reconnecting…", connecting: "Connecting…", powered: "Powered by",
      waiting: "Commentary starts at kick-off.", jersey: "jersey"
    },
    sq: {
      teams: { Argentina: "Argjentina", France: "Franca" },
      live: "Live", feedSub: "Komente nga AI", predict: "Kush shënon tjetër?", hint: "Zgjidh një lojtar për parashikimin tënd.",
      votes: function (n) { return n === 1 ? "1 votë" : n + " vota"; }, noVotes: "Ende pa vota",
      ask: "Pyet", askPh: "Pyet çfarëdo për këtë ndeshje", youAsked: "Ti pyete", answer: "Përgjigje për ty",
      thinking: "Duke menduar…", goal: "Gol", update: "Njoftim",
      flash: "Ofertë flash", endsIn: "Mbaron për", buy: "Bli tani", buying: "Duke porositur…", later: "Jo tani",
      ordered: "Porosia u mor. Konfirmimi po vjen.", expired: "Kjo ofertë ka përfunduar.",
      off: "Zëvendësuar", pens: "Penalltitë", pensMin: "Pen.", pre: "Para ndeshjes",
      reconnecting: "Po rilidhet…", connecting: "Po lidhet…", powered: "Mundësuar nga",
      waiting: "Komentet nisin me fishkëllimën e parë.", jersey: "fanellë"
    },
    es: {
      teams: { Argentina: "Argentina", France: "Francia" },
      live: "En vivo", feedSub: "Narración con IA", predict: "¿Quién marca el próximo?", hint: "Toca un jugador para hacer tu pronóstico.",
      votes: function (n) { return n === 1 ? "1 voto" : n + " votos"; }, noVotes: "Aún sin votos",
      ask: "Preguntar", askPh: "Pregunta lo que quieras del partido", youAsked: "Preguntaste", answer: "Respuesta para ti",
      thinking: "Pensando…", goal: "Gol", update: "Aviso",
      flash: "Oferta flash", endsIn: "Termina en", buy: "Comprar", buying: "Pidiendo…", later: "Ahora no",
      ordered: "Pedido recibido. La confirmación va en camino.", expired: "Esta oferta ha terminado.",
      off: "Sustituido", pens: "Penales", pensMin: "Pen.", pre: "Previa",
      reconnecting: "Reconectando…", connecting: "Conectando…", powered: "Con tecnología de",
      waiting: "La narración empieza con el pitido inicial.", jersey: "camiseta"
    },
    ar: {
      teams: { Argentina: "الأرجنتين", France: "فرنسا" },
      live: "مباشر", feedSub: "تعليق بالذكاء الاصطناعي", predict: "من يسجل الهدف القادم؟", hint: "اختر لاعبًا لتسجيل توقعك.",
      votes: function (n) { return n + " صوت"; }, noVotes: "لا توقعات بعد",
      ask: "اسأل", askPh: "اسأل أي شيء عن هذه المباراة", youAsked: "سؤالك", answer: "إجابة لك",
      thinking: "جارٍ التفكير…", goal: "هدف", update: "تنبيه",
      flash: "عرض سريع", endsIn: "ينتهي خلال", buy: "اشترِ الآن", buying: "جارٍ الطلب…", later: "ليس الآن",
      ordered: "تم استلام طلبك. التأكيد في الطريق.", expired: "انتهى هذا العرض.",
      off: "خرج", pens: "ركلات الترجيح", pensMin: "ترجيح", pre: "قبل المباراة",
      reconnecting: "جارٍ إعادة الاتصال…", connecting: "جارٍ الاتصال…", powered: "بدعم من",
      waiting: "يبدأ التعليق مع صافرة البداية.", jersey: "قميص"
    }
  };
  var T = STR[lang];

  var SHORTLIST = {
    Argentina: ["Messi", "Di María", "Julián Álvarez", "Lautaro Martínez"],
    France: ["Mbappé", "Griezmann", "Giroud", "Kolo Muani"]
  };
  var NUMBERS = {
    "Messi": 10, "Di María": 11, "Julián Álvarez": 9, "Lautaro Martínez": 22, "Dybala": 21, "Paredes": 5, "Montiel": 4,
    "Enzo Fernández": 24, "Mac Allister": 20, "De Paul": 7, "Acuña": 8, "Emiliano Martínez": 23,
    "Mbappé": 10, "Griezmann": 7, "Giroud": 9, "Kolo Muani": 12, "Thuram": 15, "Coman": 20, "Tchouaméni": 8,
    "Dembélé": 11, "Rabiot": 14, "Camavinga": 25
  };

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  root.lang = lang;
  root.dir = lang === "ar" ? "rtl" : "ltr";
  if (fill) root.classList.add("fill");
  if (P.get("theme") === "light") root.classList.add("light");
  var accent = P.get("accent");
  if (accent && /^#?[0-9a-f]{3,8}$/i.test(accent)) {
    accent = accent[0] === "#" ? accent : "#" + accent;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--on-accent", inkFor(accent));
  }
  // dark or light text on the host's accent, whichever reads better
  function inkFor(hex) {
    var h = hex.slice(1);
    if (h.length < 6) h = h.split("").map(function (c) { return c + c; }).join("");
    var r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    var L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.5 ? "#141414" : "#ffffff";
  }

  $("feedTitle").textContent = T.live;
  $("feedSub").textContent = T.feedSub;
  $("predictTitle").textContent = T.predict;
  $("predictHint").textContent = T.hint;
  $("askInput").placeholder = T.askPh;
  $("askBtn").textContent = T.ask;
  $("flashTag").textContent = T.flash;
  $("endsIn").textContent = T.endsIn;
  $("buyBtn").textContent = T.buy;
  $("laterBtn").textContent = T.later;
  $("pensLabel").textContent = T.pens;
  $("poweredBy").innerHTML = esc(T.powered) + " <b>Matchday OS</b>";
  $("gwWord").textContent = T.goal;

  // server system lines can carry emoji; the UI stays text-only
  function plain(t) { return String(t).replace(/\p{Extended_Pictographic}\uFE0F?/gu, "").replace(/^\s+/, ""); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---------- Flags & jersey ----------
  function flagSvg(team) {
    if (team === "Argentina") return '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#75AADB"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><circle cx="15" cy="10" r="2.1" fill="#F6B40E"/></svg>';
    if (team === "France") return '<svg viewBox="0 0 30 20"><rect width="10" height="20" fill="#0055A4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#EF4135"/></svg>';
    return '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#888"/></svg>';
  }
  function jerseySvg(player, team) {
    var num = NUMBERS[player] || "";
    var arg = team === "Argentina";
    var body = arg ? "#FFFFFF" : "#1B2C5C";
    var ink = arg ? "#1B2C5C" : "#FFFFFF";
    var stripes = arg ? '<g clip-path="url(#jc)"><rect x="34" y="0" width="12" height="140" fill="#75AADB"/><rect x="58" y="0" width="12" height="140" fill="#75AADB"/><rect x="82" y="0" width="12" height="140" fill="#75AADB"/></g>' : "";
    var name = String(player).split(" ").slice(-1)[0].toUpperCase();
    var shirt = "M38 8 L52 4 Q64 14 76 4 L90 8 L118 24 L108 50 L94 44 L94 132 L34 132 L34 44 L20 50 L10 24 Z";
    return '<svg viewBox="0 0 128 136" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><clipPath id="jc"><path d="' + shirt + '"/></clipPath></defs>' +
      '<path d="' + shirt + '" fill="' + body + '"/>' + stripes +
      '<path d="M52 4 Q64 14 76 4" fill="none" stroke="' + (arg ? "#1B2C5C" : "#EF4135") + '" stroke-width="3"/>' +
      '<text x="64" y="50" text-anchor="middle" font-family="-apple-system, system-ui, sans-serif" font-weight="700" font-size="11" fill="' + ink + '" letter-spacing="1">' + esc(name) + '</text>' +
      '<text x="64" y="104" text-anchor="middle" font-family="-apple-system, system-ui, sans-serif" font-weight="700" font-size="48" fill="' + ink + '">' + esc(num) + '</text>' +
      '</svg>';
  }

  // ---------- Match data ----------
  var MATCH = null;           // match.json
  var teamOf = {};            // player -> team
  var goalAt = {};            // clock -> [{player, team, score}]
  var eventsAt = {};          // clock -> [event types]
  var cursor = 0;             // from /api/state
  var shootout = null;
  var subbedOff = {};

  fetch(API + "/match.json").then(function (r) { return r.json(); }).then(function (m) {
    MATCH = m;
    m.events.forEach(function (e) {
      if (e.player && e.team && !teamOf[e.player]) teamOf[e.player] = e.team;
      if (e.type === "goal") (goalAt[e.clock] = goalAt[e.clock] || []).push(e);
      (eventsAt[e.clock] = eventsAt[e.clock] || []).push(e.type);
      if (e.type === "substitution" && e.detail) {
        var inP = e.detail.split(" replaces ")[0];
        if (inP && !teamOf[inP]) teamOf[inP] = e.team;
      }
    });
    renderTeams(); renderFeed(); renderPredict(); refreshMeta();
  }).catch(function () {});

  function homeName() { return MATCH ? MATCH.home.name : "Argentina"; }
  function awayName() { return MATCH ? MATCH.away.name : "France"; }
  function renderTeams() {
    var h = homeName(), a = awayName();
    $("homeFlag").innerHTML = flagSvg(h);
    $("awayFlag").innerHTML = flagSvg(a);
    $("homeCode").textContent = MATCH ? MATCH.home.short : "ARG";
    $("awayCode").textContent = MATCH ? MATCH.away.short : "FRA";
    $("homeName").textContent = T.teams[h] || h;
    $("awayName").textContent = T.teams[a] || a;
  }
  renderTeams();

  // cursor + shootout come from /api/state (the socket "score" message has neither)
  var metaTimer = null, metaBusy = false;
  function refreshMeta() {
    clearTimeout(metaTimer);
    metaTimer = setTimeout(function () {
      if (metaBusy) return refreshMeta();
      metaBusy = true;
      fetch(API + "/api/state?match=" + encodeURIComponent(match)).then(function (r) { return r.json(); }).then(function (s) {
        if (typeof s.cursor === "number") cursor = s.cursor;
        var prevPens = shootout ? shootout.home + shootout.away : 0;
        shootout = s.shootout || null;
        if (shootout && S.minute === "PENS" && shootout.home + shootout.away > prevPens && prevPens > 0) {
          // keep it subtle in the shootout: pulse the pens score
          var el = $("pens"); el.classList.add("pulse"); setTimeout(function () { el.classList.remove("pulse"); }, 2500);
        }
        computeSubs(); renderScore(); renderPredict();
      }).catch(function () {}).then(function () { metaBusy = false; });
    }, 250);
  }
  function computeSubs() {
    subbedOff = {};
    if (!MATCH) return;
    MATCH.events.slice(0, cursor).forEach(function (e) {
      if (e.type === "substitution" && e.player) subbedOff[e.player] = true;
      if (e.type === "red_card" && e.player) subbedOff[e.player] = true;
    });
  }

  // ---------- State ----------
  var S = { score: { home: 0, away: 0 }, minute: "0'", feed: [], offer: null, predictions: {} };
  var local = [];        // items the server does not keep for us: my questions, answers, system replies
  var seen = {};         // feed ids already rendered (for enter animation)
  var firstRender = true;
  var myVote = null;
  var dismissedOffer = null;
  var buy = { state: "idle", offerId: null, timer: null, text: "" };

  function lastServerId() { return S.feed.length ? S.feed[S.feed.length - 1].id : null; }

  // The wire format follows the RN SDK (numeric `minute`, `predictions` as [{player, votes}]).
  // The widget keys goals and pens on the display clock, so map back to that on the way in.
  function clockOf(x) { return x.clock || (typeof x.minute === "number" ? x.minute + "'" : x.minute); }
  function normalize(m) {
    if (m.type === "state" || m.type === "score") m.minute = clockOf(m);
    if (m.item) m.item.minute = clockOf(m.item);
    if (Array.isArray(m.feed)) {
      // Personal items (answers, order confirmations) arrive live and are kept in `local` already.
      m.feed = m.feed.filter(function (it) { return !it.personal; });
      m.feed.forEach(function (it) { it.minute = clockOf(it); });
    }
    if (Array.isArray(m.predictions)) {
      var counts = {};
      m.predictions.forEach(function (p) { counts[p.player] = p.votes; });
      m.predictions = counts;
    }
    return m;
  }

  function onMessage(m) {
    if (!m || !m.type) return;
    normalize(m);
    if (m.type === "state") {
      var prevTotal = S.score.home + S.score.away;
      S.score = m.score || { home: 0, away: 0 };
      S.minute = m.minute || "0'";
      S.feed = Array.isArray(m.feed) ? m.feed.slice() : [];
      S.predictions = m.predictions || {};
      if (!S.feed.length) { local = []; seen = {}; }
      if (myVote && !S.predictions[myVote]) myVote = null;
      setOffer(m.offer || null);
      renderScore(); renderFeed(); renderPredict();
      if (S.score.home + S.score.away !== prevTotal) refreshMeta();
    } else if (m.type === "score") {
      var old = S.score;
      var next = { home: m.home, away: m.away };
      var minuteChanged = m.minute !== S.minute;
      S.score = next; S.minute = m.minute;
      renderScore();
      var dh = next.home - old.home, da = next.away - old.away;
      var forward = dh >= 0 && da >= 0 && dh + da === 1;
      if (forward) celebrate(dh ? "home" : "away");
      if (minuteChanged || dh || da) refreshMeta();
    } else if (m.type === "feed" && m.item) {
      var it = m.item;
      if (it.kind === "commentary" || it.kind === "system") {
        if (!S.feed.some(function (x) { return x.id === it.id; })) S.feed.push(it);
      }
      if (it.kind === "answer" || it.kind === "system") {
        if (it.kind === "answer") local.forEach(function (x) { if (x.kind === "pending") x.kind = "question"; });
        local.push({ id: it.id, kind: it.kind, text: it.text, minute: it.minute, after: lastServerId() });
        if (it.kind === "system" && buy.state === "pending") buyDone(it.text);
      }
      renderFeed();
    } else if (m.type === "offer") {
      setOffer(m.offer || null);
    }
  }

  // ---------- Score ----------
  function displayMinute(min) {
    if (!min || min === "0'") return T.pre;
    if (min === "PENS") return T.pensMin;
    return min;
  }
  function renderScore() {
    $("homeScore").textContent = S.score.home;
    $("awayScore").textContent = S.score.away;
    $("minute").textContent = displayMinute(S.minute);
    var live = S.minute && S.minute !== "0'" && !(cursor >= (MATCH ? MATCH.events.length : 999));
    $("liveDot").classList.toggle("on", !!live);
    var showPens = S.minute === "PENS" && shootout;
    $("pens").hidden = !showPens;
    $("minute").hidden = !!showPens;
    if (showPens) { $("pensHome").textContent = shootout.home; $("pensAway").textContent = shootout.away; }
  }
  var wipeTimer = null;
  function celebrate(side) {
    var bug = $("bug");
    var scorer = "";
    var g = goalAt[S.minute];
    if (g) {
      var hit = g.filter(function (e) { return e.score.home === S.score.home && e.score.away === S.score.away; })[0] || g[0];
      scorer = hit.player + " · " + (T.teams[hit.team] || hit.team);
    }
    $("gwWho").textContent = scorer;
    bug.classList.remove("goal"); void bug.offsetWidth; bug.classList.add("goal");
    var n = $(side === "home" ? "homeScore" : "awayScore");
    n.classList.remove("bump"); void n.offsetWidth; n.classList.add("bump");
    clearTimeout(wipeTimer);
    wipeTimer = setTimeout(function () { bug.classList.remove("goal"); n.classList.remove("bump"); }, 6000);
  }

  // ---------- Feed ----------
  var GOAL_RE = /(^|[^\p{L}])(goal|gol|go+l|هدف)/iu;
  function isGoalItem(item, list) {
    if (item.kind !== "commentary" || !goalAt[item.minute]) return false;
    if (GOAL_RE.test(item.text)) return true;
    var same = list.filter(function (x) { return x.kind === "commentary" && x.minute === item.minute; });
    if (same.some(function (x) { return GOAL_RE.test(x.text); })) return false;
    return same[same.length - 1] === item;
  }
  function merged() {
    var out = S.feed.slice();
    var ids = {};
    out.forEach(function (x) { ids[x.id] = true; });
    local.forEach(function (l) {
      if (ids[l.id]) return;
      var at = -1;
      if (l.after) { for (var i = 0; i < out.length; i++) if (out[i].id === l.after) at = i; }
      // place after its anchor and any local items already placed after it
      var pos = l.after && at === -1 ? out.length : at + 1;
      while (pos < out.length && out[pos].__local) pos++;
      var copy = Object.assign({ __local: true }, l);
      out.splice(pos, 0, copy);
      ids[l.id] = true;
    });
    return out;
  }
  // Small monochrome icons for the timeline column
  var IC = {
    goal: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6.3"/><path d="M8 5.2l2.6 1.9-1 3H6.4l-1-3z" fill="currentColor" stroke="none"/><path d="M8 5.2V1.8M10.6 7.1l3.2-1M9.6 10.1l2 2.7M6.4 10.1l-2 2.7M5.4 7.1l-3.2-1"/></svg>',
    yellow: '<svg viewBox="0 0 16 16"><rect x="4" y="2" width="8" height="12" rx="1.2" fill="#d9b63a"/></svg>',
    red: '<svg viewBox="0 0 16 16"><rect x="4" y="2" width="8" height="12" rx="1.2" fill="#e0484f"/></svg>',
    sub: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h9M9.5 2.5 12 5 9.5 7.5M13 11H4M6.5 8.5 4 11l2.5 2.5"/></svg>',
    whistle: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="9" r="5.5"/><path d="M8 9V6.2M6.5 1.8h3"/></svg>',
    shot: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.4"/></svg>',
    pen: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 12V4h12v8"/><circle cx="8" cy="12.2" r="1.3" fill="currentColor" stroke="none"/></svg>',
    answer: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.5 3h11v7.5H7L4 13v-2.5H2.5z"/></svg>',
    note: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>'
  };
  var TYPE_IC = {
    goal: "goal", yellow_card: "yellow", red_card: "red", substitution: "sub",
    kickoff: "whistle", half_end: "whistle", full_time: "whistle", shootout_start: "whistle",
    shot_saved: "shot", shot_missed: "shot", penalty_awarded: "pen", shootout_goal: "pen", shootout_miss: "pen"
  };
  // When one clock has several events, pick the one the commentary line talks about.
  var KW = [
    [/\b(card|booked|booking)\b|tarjeta|amonest|karton|kartë|بطاقة|إنذار/i, ["red_card", "yellow_card"]],
    [/\b(replaces?|brings on|change|subs?|substitut\w*)\b|⇄|cambio|sustitu|zëvendës|ndërrim|تبديل/i, ["substitution"]],
    [/\b(miss\w*|saved?|saves|wide|over)\b|falla|ataja|fuera|humb|gabon|prit|يضيع|يتصدى|أهدر/i, ["shootout_miss", "shot_saved", "shot_missed"]],
    [/\b(clinch\w*|wins?|won|champions|full time|ends?)\b|campe|gana|fitoj|kampion|يتوج|تفوز|نهاية/i, ["full_time", "half_end"]],
    [/penalt|penal|shootout|tanda|ترجيح|جزاء/i, ["shootout_goal", "penalty_awarded", "shootout_start"]],
    [/\b(whistle|kick-?off|half-?time|under way)\b|silbat|descanso|pitido|fishkëll|pushim|صافرة|استراحة|انطلق/i, ["kickoff", "half_end", "full_time"]]
  ];
  function iconFor(it, list) {
    if (it.kind === "answer" || it.kind === "question" || it.kind === "pending") return IC.answer;
    if (it.kind === "system") return IC.note;
    if (isGoalItem(it, list)) return IC.goal;
    var types = (eventsAt[it.minute] || []).filter(function (t) { return t !== "goal"; });
    if (!types.length) return IC.note;
    var t = types[0];
    if (types.length > 1) {
      outer: for (var i = 0; i < KW.length; i++) {
        if (!KW[i][0].test(it.text)) continue;
        for (var k = 0; k < KW[i][1].length; k++) if (types.indexOf(KW[i][1][k]) >= 0) { t = KW[i][1][k]; break outer; }
      }
    }
    return IC[TYPE_IC[t]] || IC.note;
  }

  function renderFeed() {
    var list = merged();
    var feed = $("feed");
    if (!list.length) {
      feed.innerHTML = '<li class="empty">' + esc(T.waiting) + "</li>";
      return;
    }
    var html = [];
    for (var i = list.length - 1; i >= 0; i--) {
      var it = list[i];
      var isNew = !firstRender && !seen[it.id];
      seen[it.id] = true;
      var cls = "item";
      var lbl = "";
      var style = "";
      if (it.kind === "question" || it.kind === "pending") {
        cls += " question";
        lbl = it.kind === "pending" ? T.youAsked + " · " + T.thinking : T.youAsked;
      } else if (it.kind === "answer") { cls += " answer"; lbl = T.answer; }
      else if (it.kind === "system") { cls += " system"; }
      else if (isGoalItem(it, list)) {
        cls += " goal"; lbl = T.goal;
        var g = goalAt[it.minute] && goalAt[it.minute][goalAt[it.minute].length - 1];
        if (g) style = ' style="--team:' + (g.team === homeName() ? "var(--home)" : "var(--away)") + '"';
      } else if (it.minute === "PENS") cls += " pens-item";
      if (isNew) cls += " new";
      var minute = it.kind === "question" || it.kind === "pending" ? "" : '<span class="min">' + esc(displayMinute(it.minute)) + "</span>";
      html.push('<li class="' + cls + '"' + style + ">" + minute + '<span class="ic" aria-hidden="true">' + iconFor(it, list) + "</span>" + '<div class="txt">' + (lbl ? '<span class="lbl">' + esc(lbl) + "</span>" : "") + esc(it.kind === "system" ? plain(it.text) : it.text) + "</div></li>");
    }
    var keepTop = feed.scrollTop < 8;
    feed.innerHTML = html.join("");
    if (keepTop) feed.scrollTop = 0;
    firstRender = false;
  }

  // ---------- Ask ----------
  $("askForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("askInput");
    var text = input.value.trim();
    if (!text) return;
    if (!send({ type: "ask", text: text })) return;
    input.value = "";
    local.forEach(function (x) { if (x.kind === "pending") x.kind = "question"; });
    var id = "q-" + Date.now();
    local.push({ id: id, kind: "pending", text: text, minute: S.minute, after: lastServerId() });
    // drop the "thinking" hint if no answer comes back
    setTimeout(function () {
      local.forEach(function (x) { if (x.id === id && x.kind === "pending") x.kind = "question"; });
      renderFeed();
    }, 20000);
    renderFeed();
    $("feed").scrollTop = 0;
  });

  // ---------- Predict ----------
  function renderPredict() {
    var total = 0;
    Object.keys(S.predictions).forEach(function (k) { total += S.predictions[k] || 0; });
    $("voteCount").textContent = total ? T.votes(total) : T.noVotes;
    var teams = [homeName(), awayName()];
    var html = teams.map(function (team, ti) {
      var c = ti === 0 ? "var(--home)" : "var(--away)";
      var picks = (SHORTLIST[team] || []).map(function (p) {
        var n = S.predictions[p] || 0;
        var pct = total ? Math.round((n / total) * 100) : 0;
        var off = !!subbedOff[p];
        var cls = "pick" + (myVote === p ? " mine" : "");
        return '<button type="button" class="' + cls + '" data-p="' + esc(p) + '" style="--c:' + c + '"' + (off ? " disabled" : "") + ">" +
          '<span class="bar" style="width:' + pct + '%"></span>' +
          '<span class="pdot"></span><span class="pname">' + esc(p) + "</span>" +
          '<span class="pct">' + (off ? esc(T.off) : (total ? pct + "%" : "")) + "</span></button>";
      }).join("");
      return '<div class="team-col"><div class="team-head"><span class="flag">' + flagSvg(team) + "</span>" + esc(T.teams[team] || team) + "</div>" + picks + "</div>";
    }).join("");
    var box = $("voteTeams");
    // update in place when possible so bar widths animate
    var existing = box.querySelectorAll(".pick");
    if (existing.length === 8 && box.dataset.sig === sig()) {
      existing.forEach(function (b) {
        var p = b.dataset.p, n = S.predictions[p] || 0, pct = total ? Math.round((n / total) * 100) : 0;
        var off = !!subbedOff[p];
        b.querySelector(".bar").style.width = pct + "%";
        b.querySelector(".pct").textContent = off ? T.off : (total ? pct + "%" : "");
        b.classList.toggle("mine", myVote === p);
        b.disabled = off;
      });
      return;
    }
    box.innerHTML = html;
    box.dataset.sig = sig();
  }
  function sig() { return homeName() + awayName(); }
  $("voteTeams").addEventListener("click", function (e) {
    var b = e.target.closest(".pick");
    if (!b || b.disabled) return;
    var p = b.dataset.p;
    if (!send({ type: "vote", player: p })) return;
    myVote = p;
    renderPredict();
  });

  // ---------- Offer ----------
  var tick = null, dockTimer = null;
  function dock() { clearTimeout(dockTimer); $("sheetWrap").classList.add("docked"); }
  $("sheetWrap").addEventListener("click", function (e) { if (e.target === this) dock(); });
  function setOffer(offer) {
    var cur = S.offer;
    S.offer = offer;
    if (!offer) {
      if (buy.state === "done" && cur) return; // keep the confirmation up until it auto-closes
      return hideSheet();
    }
    if (offer.id === dismissedOffer) return;
    if (offer.expiresAt <= Date.now()) return hideSheet();
    if (!cur || cur.id !== offer.id) { resetBuy(); showSheet(offer); }
  }
  function price(n) {
    try { return new Intl.NumberFormat(lang === "ar" ? "ar-u-nu-latn" : lang, { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
    catch (e) { return "€" + n; }
  }
  function showSheet(o) {
    var team = teamOf[o.player] || homeName();
    $("jersey").innerHTML = jerseySvg(o.player, team);
    $("offerTitle").textContent = o.title || (o.player + " " + T.jersey);
    // priceEur is the final price; originalPriceEur (optional) is the struck-through one.
    var was = o.originalPriceEur || Math.round((o.priceEur / (1 - (o.discountPct || 0) / 100)) * 100) / 100;
    $("priceNow").textContent = price(o.priceEur);
    $("priceWas").textContent = price(was);
    $("priceOff").textContent = "-" + (o.discountPct || 0) + "%";
    var wrap = $("sheetWrap");
    wrap.hidden = false;
    wrap.classList.remove("docked");
    clearTimeout(dockTimer);
    dockTimer = setTimeout(dock, 7000);
    o.__start = o.__start || Date.now();
    clearInterval(tick);
    tick = setInterval(updateCountdown, 250);
    updateCountdown();
  }
  function updateCountdown() {
    var o = S.offer;
    if (!o) return;
    var left = Math.max(0, o.expiresAt - Date.now());
    var s = Math.ceil(left / 1000);
    var mmss = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    $("countdown").textContent = mmss;
    $("miniCount").textContent = mmss;
    var span = Math.max(1, o.expiresAt - o.__start);
    $("timebar").style.transform = "scaleX(" + Math.min(1, left / span) + ")";
    if (left <= 0 && buy.state !== "done") {
      clearInterval(tick);
      $("sheetActions").hidden = true;
      showConfirm(T.expired);
      setTimeout(hideSheet, 2200);
    }
  }
  function hideSheet() {
    clearInterval(tick);
    clearTimeout(dockTimer);
    $("sheetWrap").hidden = true;
    resetBuy();
  }
  function resetBuy() {
    clearTimeout(buy.timer);
    buy = { state: "idle", offerId: null, timer: null };
    $("buyBtn").disabled = false;
    $("buyBtn").textContent = T.buy;
    $("sheetActions").hidden = false;
    $("confirm").hidden = true;
  }
  function showConfirm(text) {
    $("confirm").textContent = plain(text);
    $("confirm").hidden = false;
  }
  function buyDone(text) {
    clearTimeout(buy.timer);
    buy.state = "done";
    $("sheetActions").hidden = true;
    showConfirm(text);
    clearInterval(tick);
    buy.timer = setTimeout(function () { dismissedOffer = buy.offerId; hideSheet(); }, 6000);
  }
  $("buyBtn").addEventListener("click", function () {
    var o = S.offer;
    if (!o || buy.state !== "idle") return;
    if (!send({ type: "buy", offerId: o.id })) return;
    buy.state = "pending"; buy.offerId = o.id;
    $("buyBtn").disabled = true;
    $("buyBtn").textContent = T.buying;
    buy.timer = setTimeout(function () { if (buy.state === "pending") buyDone(T.ordered); }, 5000);
  });
  $("laterBtn").addEventListener("click", function () {
    dismissedOffer = S.offer && S.offer.id;
    hideSheet();
  });

  // ---------- Socket with auto-reconnect ----------
  var ws = null, connected = false, everConnected = false, retryTimer = null, connTimer = null;
  function setConn(ok) {
    connected = ok;
    clearTimeout(connTimer);
    if (ok) { $("conn").hidden = true; return; }
    // only surface it if the gap is noticeable
    connTimer = setTimeout(function () {
      if (connected) return;
      $("connText").textContent = everConnected ? T.reconnecting : T.connecting;
      $("conn").hidden = false;
    }, everConnected ? 600 : 1200);
  }
  function connect() {
    clearTimeout(retryTimer);
    var q = new URLSearchParams({ match: match, userId: userId, lang: lang });
    fetch(API + "/connect?" + q.toString()).then(function (r) {
      if (!r.ok) throw new Error("connect " + r.status);
      return r.json();
    }).then(function (j) {
      var sock = new WebSocket(j.websocketUrl);
      ws = sock;
      sock.onopen = function () { everConnected = true; setConn(true); refreshMeta(); };
      sock.onmessage = function (e) { try { onMessage(JSON.parse(e.data)); } catch (err) {} };
      sock.onclose = function () { if (ws === sock) { ws = null; setConn(false); retry(); } };
      sock.onerror = function () { try { sock.close(); } catch (err) {} };
    }).catch(function () { setConn(false); retry(); });
  }
  function retry() { clearTimeout(retryTimer); retryTimer = setTimeout(connect, 1000); }
  function send(msg) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }
  setConn(false);
  connect();
  // Shootout/subs come from /api/state; refresh slowly in the background too.
  setInterval(function () { if (connected) refreshMeta(); }, 5000);

  // ---------- Embed height ----------
  if (embedded && window.parent !== window) {
    var lastH = 0;
    var post = function () {
      var h = Math.ceil($("w").getBoundingClientRect().height);
      if (h !== lastH) { lastH = h; window.parent.postMessage({ mdos: "height", frame: frameId, h: h }, "*"); }
    };
    new ResizeObserver(post).observe($("w"));
    post();
  }

  renderScore(); renderFeed(); renderPredict();

  // Test hook for local QA (simulates server messages; does not talk to the server).
  window.__mdos = { inject: onMessage, state: S, drop: function () { if (ws) ws.close(); } };
})();
