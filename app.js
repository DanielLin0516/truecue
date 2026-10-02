// TrueCue site v2. No third-party code, no tracking. Two jobs: the language menu (with a
// first-visit default from the browser's language) and the live table on the home page.

(() => {
  const root = document.documentElement;
  const here = root.dataset.folder || "";          // "" = English at the root
  const page = root.dataset.page || "index";
  const up = here ? "../" : "";
  const supported = ["", "ja", "ko", "zh-hant", "zh-hans", "es", "fr"];
  const KEY = "truecue.lang";

  function fromBrowser() {
    for (const tag of navigator.languages || [navigator.language || "en"]) {
      const t = String(tag).toLowerCase();
      if (t.startsWith("zh")) return /hant|tw|hk|mo/.test(t) ? "zh-hant" : "zh-hans";
      const base = t.split("-")[0];
      if (base === "en") return "";
      if (supported.includes(base)) return base;
    }
    return "";
  }
  function urlFor(folder) {
    return up + (folder ? folder + "/" : "") + (page === "index" ? "" : page + ".html");
  }

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  // First visit to an English page: go to the visitor's language. Never for search engines (each
  // language has its own page and hreflang links), and never once a visitor has picked one.
  const bot = /bot|crawl|spider|slurp|bing|google|baidu|yandex|duckduck|facebookexternalhit|lighthouse/i.test(navigator.userAgent);
  if (!bot && saved === null && here === "") {
    const want = fromBrowser();
    if (want) { location.replace(urlFor(want)); return; }
  }

  const menu = document.getElementById("lang");
  if (menu) {
    menu.querySelectorAll("a[data-folder]").forEach(a => {
      a.addEventListener("click", () => { try { localStorage.setItem(KEY, a.dataset.folder); } catch (e) {} });
    });
    document.addEventListener("click", e => { if (!menu.contains(e.target)) menu.open = false; });
    document.addEventListener("keydown", e => { if (e.key === "Escape") menu.open = false; });
  }
})();

// The table: a top-down cue strokes the cue ball; the wrist path draws in brass dots. Used by the
// home page (a run of strokes, each scored on the watch) and by each fault page (the fault and the
// right way, side by side). A stroke is a set of knobs:
//   drift   where the back hand ends up sideways (share of the table's width)
//   wiggle  a sideways wobble while stroking (twisting the wrist)
//   pause   ms held at the back          decel  the hand slows before contact (ball rolls short)
//   jab     the cue is pulled back right after contact   wander  the hand moves during the finish
function table(cv, strokes, onStroke) {
  const ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0;
  function size() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const easeIn = t => t * t * t, easeOut = t => 1 - Math.pow(1 - t, 3);

  function felt() {
    const g = ctx.createRadialGradient(W * .5, H * .1, 10, W * .5, H * .45, H * .8);
    g.addColorStop(0, "#22604a"); g.addColorStop(.45, "#164433"); g.addColorStop(1, "#0a2219");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(245,238,220,.07)"; ctx.setLineDash([3, 7]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W * .5, H * .06); ctx.lineTo(W * .5, H * .96); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(245,238,220,.18)"; ctx.beginPath(); ctx.arc(W * .5, H * .11, 2.5, 0, 7); ctx.fill();
  }
  function ball(x, y, r, a) {
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x + r * .25, y + r * .35, r, r * .8, 0, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
    g.addColorStop(0, "#fffdf6"); g.addColorStop(.7, "#ebe2c9"); g.addColorStop(1, "#a99c7c");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  function cue(tx, ty, hx, hy) {
    const ang = Math.atan2(hy - ty, hx - tx), len = Math.hypot(W, H);
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang);
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(6, 4, len, W * .022);
    const w0 = W * .012, w1 = W * .028;
    const shaft = ctx.createLinearGradient(0, -w1, 0, w1);
    shaft.addColorStop(0, "#f3e2b8"); shaft.addColorStop(.5, "#e2c891"); shaft.addColorStop(1, "#b6955c");
    ctx.fillStyle = shaft; ctx.beginPath(); ctx.moveTo(0, -w0 / 2); ctx.lineTo(len * .55, -w1 / 2 * .8); ctx.lineTo(len * .55, w1 / 2 * .8); ctx.lineTo(0, w0 / 2); ctx.fill();
    ctx.fillStyle = "#4a2e17"; ctx.fillRect(len * .55, -w1 / 2, len, w1);
    ctx.fillStyle = "#D9B26A"; ctx.fillRect(len * .55 - 3, -w1 / 2, 5, w1);
    ctx.fillStyle = "#f7f3ea"; ctx.fillRect(0, -w0 / 2, W * .02, w0);
    ctx.fillStyle = "#5e86b8"; ctx.fillRect(-2, -w0 / 2, 3, w0);
    ctx.restore();
  }

  // The stroke at time t: the hand's pull (1 = full backswing, negative = past contact), its
  // sideways share, and the timeline marks.
  function timeline(s) {
    const T = { settle: 500, back: 700, pause: s.pause ?? 450, fwd: s.decel ? 420 : 320, hold: 1300, reset: 600 };
    const a = T.settle, b = a + T.back, c = b + T.pause, d = c + T.fwd, e = d + T.hold;
    return { T, a, b, c, d, e, total: e + T.reset, hit: c + T.fwd * (s.decel ? .82 : .74) };
  }
  function pose(s, L, t) {
    const { T, a, b, c, d, e } = L;
    let pull = 0, lateral = 0, wob = 0, phase = "settle";
    if (t < a) pull = 0;
    else if (t < b) { phase = "back"; pull = ease((t - a) / T.back); }
    else if (t < c) { phase = "pause"; pull = 1; }
    else if (t < d) {
      phase = "fwd"; const p = (t - c) / T.fwd;
      pull = 1 - (s.decel ? easeOut(p) * 1.12 : easeIn(p) * 1.35); lateral = s.decel ? easeOut(p) : easeIn(p);
      if (s.wiggle) wob = Math.sin(p * Math.PI * 3) * s.wiggle;
    } else if (t < e) {
      phase = "hold"; const q = (t - d) / T.hold;
      pull = s.decel ? -.12 : -.35; lateral = 1;
      if (s.jab) pull = -.35 + Math.min(1, q * 5) * .55;
      if (s.wander) wob = Math.sin(q * Math.PI * 4) * s.wander * Math.min(1, q * 3);
    } else {
      phase = "reset"; const p = ease((t - e) / T.reset);
      pull = (s.jab ? .2 : s.decel ? -.12 : -.35) * (1 - p); lateral = 1 - p;
    }
    return { pull, lateral, wob, phase };
  }

  let k = 0, t0 = performance.now(), shown = -1, trail = [], visible = true;
  function draw(t) {
    const s = strokes[k % strokes.length], L = timeline(s);
    const bx = W * .5, by = H * .3, r = W * .045, handY = H * .86, contactY = by + r + 2;
    const { pull, lateral, wob, phase } = pose(s, L, t);
    const back = H * .13, tipY = contactY + 6 + pull * back;
    const side = ((s.drift || 0) * lateral + wob) * W;
    const hx = bx + side, hy = handY + pull * back;
    const bridgeY = H * .58, bridgeX = bx + side * .15;
    const dirx = bridgeX - hx, diry = bridgeY - hy, f = (tipY - hy) / diry;
    const tx = hx + dirx * f;
    let ballX = bx, ballY = by, ballA = 1;
    if (t >= L.hit && t < L.e + L.T.reset) {
      const q = Math.min(1, (t - L.hit) / 900), len = Math.hypot(dirx, diry);
      const run = (1 - Math.pow(1 - q, 2)) * H * (s.decel ? .12 : .26);
      if (!s._dir) s._dir = [dirx / len, diry / len];          // the ball keeps the line it was hit on
      ballX = bx + s._dir[0] * run; ballY = by + s._dir[1] * run;
      ballA = 1 - Math.max(0, q - .6) / .4;
    }
    if (phase === "fwd" || phase === "hold") trail.push([hx, hy]);
    felt();
    ctx.fillStyle = "rgba(243,215,149,.9)";
    trail.forEach(([x, y], i) => { if (i % 2 === 0) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); } });
    if (t >= L.hit) ball(ballX, ballY, r, ballA);
    ball(bx, by, r, t < L.hit ? 1 : phase === "reset" ? ease((t - L.e) / L.T.reset) : 0);
    cue(tx, tipY, hx, hy);
    if (onStroke && t >= L.d + 150 && shown !== k) { shown = k; onStroke(s); }
    return L.total;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { t0 = now; return; }
    const total = timeline(strokes[k % strokes.length]).total;
    let t = now - t0;
    if (t > total) { strokes[k % strokes.length]._dir = null; k++; t0 = now; t = 0; trail = []; shown = -1; }
    draw(t);
  }
  size();
  // Measured again whenever the box changes: Safari can report the canvas before its CSS
  // aspect ratio applies, which drew the balls as ovals.
  new ResizeObserver(() => { size(); if (reduce) still(); }).observe(cv);
  function still() {
    // Reduce Motion: one frame, the finish of the first stroke with its path.
    const s = strokes[0], L = timeline(s);
    for (let t = L.c; t <= L.d + 400; t += 16) draw(t);
  }
  if (reduce) { still(); return; }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(cv);
  requestAnimationFrame(frame);
}

// Home: five strokes scored on the watch, the session strip growing by one bar each.
(() => {
  const cv = document.getElementById("cv");
  if (!cv) return;
  const watch = document.getElementById("watch"), scoreEl = document.getElementById("score"),
        verdictEl = document.getElementById("verdict"), ring = document.getElementById("ring"),
        strip = document.getElementById("strip"), countEl = document.getElementById("count");
  const V = { straight: watch.dataset.straight, in: watch.dataset.in, out: watch.dataset.out };
  const C = { good: "#7BD88F", warn: "#F2C14E", bad: "#FF8A7A" };
  const level = s => s >= 85 ? C.good : s >= 70 ? C.warn : C.bad;
  let count = 0;
  function addBar(s, fresh) {
    const i = document.createElement("i");
    i.style.height = (30 + (s - 60) * 1.6) + "%";
    i.style.background = level(s);
    if (fresh) i.className = "new";
    strip.appendChild(i);
    while (strip.children.length > 26) strip.firstChild.remove();
    count++; countEl.textContent = "#" + count;
  }
  [86, 91, 78, 88, 93, 84, 90, 72, 89, 94, 87, 81, 92].forEach(s => addBar(s, false));
  table(cv, [
    { drift: 0, score: 92, v: "straight" },
    { drift: .07, score: 74, v: "in" },
    { drift: .008, score: 88, v: "straight" },
    { drift: -.05, score: 79, v: "out" },
    { drift: .004, score: 95, v: "straight" },
  ], s => {
    watch.classList.remove("tap"); void watch.offsetWidth; watch.classList.add("tap");
    const col = level(s.score);
    ring.style.borderColor = col; scoreEl.style.color = col;
    verdictEl.textContent = V[s.v]; verdictEl.style.color = s.score >= 85 ? "#B8C2B0" : col;
    let n = 50;
    const step = () => { n = Math.min(s.score, n + Math.ceil((s.score - n) / 4) + 1); scoreEl.textContent = n; if (n < s.score) requestAnimationFrame(step); };
    step();
    addBar(s.score, true);
  });
})();

// Fault pages: <canvas class="demo" data-fault="backHandIn" data-mode="wrong|right">.
(() => {
  const FAULTS = {
    backHandIn: { drift: .13 }, backHandOut: { drift: -.12 }, wristTwist: { wiggle: .025 },
    decelerating: { decel: true }, noPause: { pause: 0 }, jab: { jab: true }, finishMoving: { wander: .035 },
  };
  document.querySelectorAll("canvas.demo").forEach(cv => {
    const wrong = cv.dataset.mode === "wrong";
    table(cv, [wrong ? Object.assign({}, FAULTS[cv.dataset.fault]) : { drift: 0 }]);
  });
})();
