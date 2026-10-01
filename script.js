/* =============================================================
   100balkonoff — «Бобёр на пробежке»
   Бесконечный раннер: бег по лесу без финиша, скорость растёт,
   день сменяется ночью. Всё рисуется в логических координатах
   и масштабируется под размер холста.
   ============================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Полифилл для очень старых браузеров без roundRect
  if (typeof ctx.roundRect !== 'function') {
    ctx.roundRect = function (x, y, w, h, r) {
      const rr = Math.min(typeof r === 'number' ? r : 0, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
    };
  }

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const speedEl = document.getElementById('speed');
  const jumpsEl = document.getElementById('jumps');
  const overlay = document.getElementById('gameOverlay');
  const resultKicker = document.getElementById('gameResultKicker');
  const resultTitle = document.getElementById('gameResultTitle');
  const resultScore = document.getElementById('gameResultScore');
  const resultBest = document.getElementById('gameResultBest');
  const restart = document.getElementById('restart');
  const muteBtn = document.getElementById('muteBtn');
  const stage = document.querySelector('.game-stage');

  // ---------------- Логический мир ----------------
  const H = 340;              // «эталонная» высота мира
  const GROUND_BAND = 54;     // толщина полосы земли под ногами
  const WORLD_MIN_W = 780;    // минимум видимой ширины мира (запас на реакцию)
  const MAX_VIEW_H = 520;     // чтобы небо не растягивалось на узких экранах
  const GRAVITY = 1500;
  const JUMP1 = 700;
  const JUMP2 = 645;
  const MAX_JUMPS = 2;
  const PX_PER_M = 26;        // логических единиц в одном «метре»
  const DAY_CYCLE = 64;       // секунд на полный цикл день → ночь → день
  const SPEED_START = 0.30;   // стартовая скорость: долей ширины экрана в секунду
  const SPEED_MAX = 0.78;     // максимальная скорость
  const SPEED_RAMP = 9000;    // за столько единиц пути скорость удваивается
  const CROW_BOOST = 0.38;    // ворона летит навстречу быстрее прокрутки мира
  const FIRST_CROW_LEVEL = 3; // с какого уровня появляется ворона

  let viewW = 1000;           // видимая ширина мира
  let viewH = H;              // видимая высота мира
  let groundY = H - GROUND_BAND;
  let scale = 1, dpr = 1, cssW = 1000, cssH = 340;

  // ---------------- Состояние игры ----------------
  let state = 'ready';        // ready | running | paused | over
  let distance = 0;           // пройденный путь (логические единицы)
  let meters = 0;             // он же в «метрах»
  let speedF = SPEED_START;
  let speed = 300;
  let scroll = 0;             // сдвиг мира для параллакса
  let elapsed = 0;            // секунд от начала забега
  let dayT = 0.08;            // время суток: 0 рассвет, .25 день, .5 закат, .75 ночь
  let obstacles = [];
  let particles = [];
  let nextSpawn = 0;
  const spawnGaps = [];       // интервалы между препятствиями (нужны тестам)
  let spawnedCount = 0;
  let crowShown = false;
  let raf = 0;
  let lastT = 0;
  let shake = 0;
  let flash = 0;
  let toast = { text: '', life: 0, total: 1 };
  let level = 1;
  let recordShown = false;
  let pal = null;             // текущая палитра неба/леса

  let best = Number(localStorage.getItem('bobrBestM') || 0) || 0;
  let muted = localStorage.getItem('bobrMuted') === '1';

  const bob = {
    x: 112, feetY: 286, w: 104, h: 132, vy: 0,
    onGround: true, jumpCount: 0, runPhase: 0, blink: 0, coyote: 0,
    spin: 0, spinning: false
  };
  let airTime = 0;

  // ---------------- Мелкие утилиты ----------------
  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hash = n => { const s = Math.sin(n * 127.1 + 31.7) * 43758.5453; return s - Math.floor(s); };

  function hexToRgb(h) {
    const s = h.replace('#', '');
    const v = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function mixRgb(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // ---------------- Размер холста ----------------
  // Мир всегда заполняет холст целиком: масштаб подбирается так, чтобы
  // показать не меньше WORLD_MIN_W по ширине и не больше MAX_VIEW_H по высоте.
  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(280, Math.round(rect.width || canvas.clientWidth || 960));
    cssH = Math.max(180, Math.round(rect.height || 320));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const byHeight = (cssH * dpr) / H;
    viewW = Math.max(WORLD_MIN_W, (cssW * dpr) / byHeight);
    let sc = (cssW * dpr) / viewW;
    let vh = (cssH * dpr) / sc;
    if (vh > MAX_VIEW_H) {
      vh = MAX_VIEW_H;
      sc = (cssH * dpr) / vh;
      viewW = (cssW * dpr) / sc;
    }
    scale = sc;
    viewH = vh;
    groundY = viewH - GROUND_BAND;
    bob.x = clamp(viewW * 0.11, 74, 130);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    buildStars();
    buildClouds();
  }

  // ---------------- Звук (WebAudio, без внешних файлов) ----------------
  let ac = null;
  function ensureAudio() {
    if (muted) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ac) ac = new AC();
    if (ac.state === 'suspended' && ac.resume) ac.resume();
    return ac;
  }
  function tone(freq, dur, opt) {
    const o = opt || {};
    const a = ensureAudio();
    if (!a) return;
    try {
      const t0 = a.currentTime + (o.delay || 0);
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = o.type || 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + o.slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.14, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    } catch (e) { /* звук не критичен */ }
  }
  const sfxJump = () => tone(480, 0.14, { slide: 300, vol: 0.13 });
  const sfxJump2 = () => { tone(620, 0.16, { slide: 420, vol: 0.13 }); tone(310, 0.12, { delay: 0.02, vol: 0.07 }); };
  const sfxDodge = () => tone(150, 0.07, { type: 'square', vol: 0.05, slide: -40 });
  const sfxCrash = () => { tone(180, 0.45, { type: 'sawtooth', vol: 0.16, slide: -140 }); tone(90, 0.55, { type: 'square', vol: 0.10, delay: 0.03, slide: -40 }); };
  const sfxLevel = () => { tone(660, 0.12, { vol: 0.11 }); tone(880, 0.18, { delay: 0.11, vol: 0.11 }); };
  const sfxRecord = () => { tone(523, 0.12, { vol: 0.10 }); tone(659, 0.12, { delay: 0.1, vol: 0.10 }); tone(784, 0.22, { delay: 0.2, vol: 0.11 }); };

  function updateMuteBtn() {
    if (!muteBtn) return;
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
    muteBtn.title = muted ? 'Включить звук (M)' : 'Выключить звук (M)';
    muteBtn.classList.toggle('is-off', muted);
  }
  function toggleMute() {
    muted = !muted;
    localStorage.setItem('bobrMuted', muted ? '1' : '0');
    updateMuteBtn();
    if (!muted) sfxDodge();
  }

  // ---------------- Интерфейс над игрой ----------------
  const hudCache = {};
  function setText(el, key, value) {
    if (!el || hudCache[key] === value) return;
    hudCache[key] = value;
    el.textContent = value;
  }
  function updateHud() {
    setText(scoreEl, 'score', String(Math.floor(meters)).padStart(4, '0'));
    setText(bestEl, 'best', String(Math.floor(best)).padStart(4, '0'));
    setText(speedEl, 'speed', '×' + (speedF / SPEED_START).toFixed(2));
    setText(jumpsEl, 'jumps', `${Math.max(0, MAX_JUMPS - bob.jumpCount)}/${MAX_JUMPS}`);
  }

  function showOverlay(kicker, title, line, bestLine, btn) {
    if (!overlay) return;
    resultKicker.textContent = kicker;
    resultTitle.textContent = title;
    resultScore.textContent = line;
    if (resultBest) {
      resultBest.textContent = bestLine || '';
      resultBest.hidden = !bestLine;
    }
    restart.textContent = btn;
    overlay.hidden = false;
  }

  function showToast(text, seconds) {
    toast.text = text;
    toast.total = seconds || 1.7;
    toast.life = toast.total;
  }

  function showStartScreen() {
    showOverlay(
      'БЕСКОНЕЧНЫЙ БЕГ • 100BALKONOFF',
      'Бобёр на лесной пробежке 🦫',
      'Пробел, ↑ или тап — прыжок. Второе нажатие в воздухе даёт двойной прыжок. Под вороной прыгать нельзя — под ней нужно пробежать.',
      best > 0 ? `Твой рекорд: ${Math.floor(best)} м` : '',
      'Начать бег'
    );
  }

  // ---------------- Управление состоянием ----------------
  function resetBeaver() {
    bob.feetY = groundY;
    bob.vy = 0;
    bob.onGround = true;
    bob.jumpCount = 0;
    bob.runPhase = 0;
    bob.blink = 0;
    bob.coyote = 0;
    bob.spin = 0;
    bob.spinning = false;
    airTime = 0;
  }

  function startGame() {
    distance = 0;
    meters = 0;
    scroll = 0;
    elapsed = 0;
    speedF = SPEED_START;
    speed = SPEED_START * viewW;
    dayT = 0.08;
    level = 1;
    recordShown = false;
    obstacles = [];
    particles = [];
    spawnGaps.length = 0;
    spawnedCount = 0;
    crowShown = false;
    nextSpawn = viewW * 0.95;
    shake = 0;
    flash = 0;
    toast.life = 0;
    resetBeaver();
    state = 'running';
    if (overlay) overlay.hidden = true;
    updateHud();
    ensureAudio();
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function pauseGame() {
    if (state !== 'running') return;
    state = 'paused';
    cancelAnimationFrame(raf);
    raf = 0;
    showOverlay('ПАУЗА', 'Бобёр переводит дух', `Пробежал: ${Math.floor(meters)} м`, '', 'Продолжить бег');
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'running';
    if (overlay) overlay.hidden = true;
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function updateBest() {
    const m = Math.floor(meters);
    if (m > best) {
      best = m;
      localStorage.setItem('bobrBestM', String(best));
      return true;
    }
    return false;
  }

  function gameOver(isCrow) {
    state = 'over';
    shake = 1;
    flash = 1;
    sfxCrash();
    const isRecord = updateBest();
    burst(bob.x + 50, bob.feetY - 40, isCrow ? 16 : 22, isCrow ? ['#2b2b38', '#4b4b60', '#e0a33c'] : ['#8b5a33', '#b98250', '#c91627', '#5f3a22']);
    showOverlay(
      'ОЙ!',
      isCrow ? 'Бобёр столкнулся с вороной 🐦' : 'Бобёр споткнулся о бревно 🪵',
      `Пробежал: ${Math.floor(meters)} м`,
      isRecord ? '🏆 Это новый рекорд!' : `Рекорд: ${Math.floor(best)} м`,
      'Начать снова'
    );
    updateHud();
  }
  // =============================================================
  //  Палитра дня и ночи
  //  t = 0.00 рассвет · 0.25 день · 0.50 закат · 0.75 полночь · 1 рассвет
  // =============================================================
  const PAL_RAW = [
    { t: 0.00, a: '#1f2a58', b: '#8a5f86', c: '#f2a463', far: '#8595a8', mid: '#4a6a4e', g1: '#a3713f', g2: '#74492a', g3: '#3d2415', star: 0.45, cel: '#ffd08a' },
    { t: 0.25, a: '#2f7fc4', b: '#8ec6ea', c: '#eaf6fd', far: '#a8c39b', mid: '#6d9459', g1: '#a5773f', g2: '#7b4d29', g3: '#472a17', star: 0.00, cel: '#fff4c6' },
    { t: 0.50, a: '#2b2f6b', b: '#c25a3c', c: '#f8b473', far: '#7d7f93', mid: '#4b5c46', g1: '#96603a', g2: '#6b3f22', g3: '#3a2213', star: 0.20, cel: '#ffbe63' },
    { t: 0.75, a: '#050915', b: '#0d1533', c: '#1d2a52', far: '#26304a', mid: '#1a2530', g1: '#453022', g2: '#2c1d14', g3: '#170f0a', star: 1.00, cel: '#e6eeff' },
    { t: 1.00, a: '#1f2a58', b: '#8a5f86', c: '#f2a463', far: '#8595a8', mid: '#4a6a4e', g1: '#a3713f', g2: '#74492a', g3: '#3d2415', star: 0.45, cel: '#ffd08a' }
  ];
  const PAL_KEYS = ['a', 'b', 'c', 'far', 'mid', 'g1', 'g2', 'g3', 'cel'];
  const PAL = PAL_RAW.map(p => {
    const o = { t: p.t, star: p.star };
    for (const k of PAL_KEYS) o[k] = hexToRgb(p[k]);
    return o;
  });

  function paletteAt(t) {
    t = t - Math.floor(t);
    let i = 0;
    while (i < PAL.length - 2 && t > PAL[i + 1].t) i++;
    const p0 = PAL[i], p1 = PAL[i + 1];
    const f = clamp((t - p0.t) / ((p1.t - p0.t) || 1), 0, 1);
    const out = { star: lerp(p0.star, p1.star, f) };
    for (const k of PAL_KEYS) out[k] = mixRgb(p0[k], p1[k], f);
    return out;
  }

  // ---------------- Звёзды и облака ----------------
  let stars = [];
  let clouds = [];

  function buildStars() {
    stars = [];
    for (let i = 0; i < 110; i++) {
      stars.push({
        nx: hash(i * 3.1 + 1),
        ny: hash(i * 7.7 + 4) * 0.74,
        r: 0.7 + hash(i * 11.3) * 1.6,
        ph: hash(i * 5.9) * 6.283
      });
    }
  }

  function buildClouds() {
    clouds = [];
    for (let i = 0; i < 6; i++) {
      clouds.push({
        n: hash(i * 2.3 + 0.4),
        y: 0.06 + hash(i * 4.1) * 0.34,
        s: 0.7 + hash(i * 6.7) * 0.85,
        sp: 0.10 + hash(i * 8.3) * 0.22,
        ph: hash(i * 9.1) * 6.283
      });
    }
  }

  function cloudShape(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 17 * s, 0, Math.PI * 2);
    ctx.arc(x + 23 * s, y - 7 * s, 24 * s, 0, Math.PI * 2);
    ctx.arc(x + 52 * s, y, 18 * s, 0, Math.PI * 2);
    ctx.roundRect(x - 9 * s, y, 68 * s, 15 * s, 8 * s);
    ctx.fill();
  }

  function drawClouds() {
    const base = mixRgb([255, 255, 255], pal.b, 0.42);
    const col = mixRgb(base, [255, 255, 255], 0.55 * (1 - pal.star));
    const alpha = 0.10 + 0.55 * (1 - pal.star);
    ctx.fillStyle = rgba(col, 1);
    for (const c of clouds) {
      const x = ((c.n * viewW + elapsed * c.sp * viewW * 0.05) % (viewW + 460)) - 230;
      ctx.globalAlpha = alpha * (0.7 + 0.3 * hash(c.n * 31));
      cloudShape(x, 14 + c.y * groundY, c.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawStars() {
    if (pal.star < 0.03) return;
    for (const s of stars) {
      const tw = 0.42 + 0.58 * Math.sin(elapsed * 1.8 + s.ph);
      const a = pal.star * tw;
      if (a <= 0.02) continue;
      ctx.fillStyle = `rgba(255,252,240,${a})`;
      ctx.beginPath();
      ctx.arc(s.nx * viewW, s.ny * (groundY - 30), s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------- Солнце и луна ----------------
  function celestialSpot(p) {
    const x = viewW * 0.08 + p * viewW * 0.84;
    const arc = Math.sin(Math.PI * p);
    const amp = Math.max(120, (groundY - 80) * 0.86);
    return { x, y: groundY - 58 - arc * amp };
  }

  function drawCelestial() {
    // Солнце живёт от рассвета до заката, луна — от заката до рассвета.
    const dayP = dayT;
    const isSun = dayP >= 0.02 && dayP <= 0.50;
    const isMoon = dayP >= 0.50 && dayP <= 0.99;

    if (isSun) {
      const p = clamp((dayP - 0.02) / 0.46, 0, 1);
      const s = celestialSpot(p);
      const low = 1 - Math.sin(Math.PI * p);           // 0 в зените, 1 у горизонта
      const r = 24 + low * 9;
      const col = mixRgb(pal.cel, hexToRgb('#ff7b3d'), low * 0.55);
      const halo = ctx.createRadialGradient(s.x, s.y, r * 0.6, s.x, s.y, r * 5.2);
      halo.addColorStop(0, rgba(col, 0.42));
      halo.addColorStop(0.45, rgba(col, 0.14));
      halo.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 5.2, 0, Math.PI * 2);
      ctx.fill();
      // лучи
      ctx.strokeStyle = rgba(col, 0.30);
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + elapsed * 0.12;
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(ang) * (r + 8), s.y + Math.sin(ang) * (r + 8));
        ctx.lineTo(s.x + Math.cos(ang) * (r + 20 + low * 8), s.y + Math.sin(ang) * (r + 20 + low * 8));
        ctx.stroke();
      }
      ctx.fillStyle = rgba(col, 1);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isMoon) {
      const p = clamp((dayT - 0.52) / 0.46, 0, 1);
      if (p > 0) {
        const s = celestialSpot(p);
        const r = 22;
        const col = pal.cel;
        const halo = ctx.createRadialGradient(s.x, s.y, r * 0.7, s.x, s.y, r * 5.4);
        halo.addColorStop(0, rgba(col, 0.34));
        halo.addColorStop(0.4, rgba(col, 0.11));
        halo.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 5.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(col, 0.96);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
        // кратеры
        ctx.fillStyle = rgba(mixRgb(col, [120, 140, 190], 0.35), 0.75);
        ctx.beginPath();
        ctx.arc(s.x - 7, s.y - 5, 4.6, 0, Math.PI * 2);
        ctx.arc(s.x + 6, s.y + 4, 3.4, 0, Math.PI * 2);
        ctx.arc(s.x + 1, s.y - 10, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------------- Лес, земля, дальний план ----------------
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, pal.a && rgba(pal.a, 1));
    g.addColorStop(0.60, rgba(pal.b, 1));
    g.addColorStop(1, rgba(pal.c, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
    drawStars();
    drawCelestial();
    drawClouds();
  }

  function drawHills() {
    const off = scroll * 0.10;
    ctx.fillStyle = rgba(mixRgb(pal.far, pal.c, 0.22), 0.8);
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= viewW + 24; x += 24) {
      const h = 26 + Math.sin((x + off) * 0.0062) * 17 + Math.sin((x + off) * 0.0173) * 9;
      ctx.lineTo(x, groundY + 12 - h);
    }
    ctx.lineTo(viewW, groundY);
    ctx.closePath();
    ctx.fill();
    // туманная дымка над землёй
    const hz = ctx.createLinearGradient(0, groundY - 46, 0, groundY);
    hz.addColorStop(0, rgba(pal.b, 0));
    hz.addColorStop(1, rgba(pal.b, 0.34));
    ctx.fillStyle = hz;
    ctx.fillRect(0, groundY - 46, viewW, 46);
  }

  function drawPines(par, spacing, hMin, hMax, color, baseY, alpha, widthF) {
    const off = scroll * par;
    const first = Math.floor(off / spacing) - 1;
    const count = Math.ceil(viewW / spacing) + 3;
    ctx.fillStyle = rgba(color, alpha);
    for (let k = 0; k < count; k++) {
      const i = first + k;
      const x = i * spacing - off + spacing;
      if (x < -80 || x > viewW + 80) continue;
      const h = hMin + hash(i * 1.7) * (hMax - hMin);
      const w = h * widthF;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.5, baseY);
      ctx.lineTo(x, baseY - h * 0.62);
      ctx.lineTo(x + w * 0.5, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - w * 0.34, baseY - h * 0.46);
      ctx.lineTo(x, baseY - h);
      ctx.lineTo(x + w * 0.34, baseY - h * 0.46);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGround() {
    ctx.fillStyle = rgba(pal.g2, 1);
    ctx.fillRect(0, groundY, viewW, viewH - groundY + 1);
    ctx.fillStyle = rgba(pal.g1, 1);
    ctx.fillRect(0, groundY, viewW, 8);
    ctx.strokeStyle = rgba(pal.g3, 0.45);
    ctx.lineWidth = 2;
    const sp = 66;
    const off = scroll % sp;
    for (let i = -1; i < viewW / sp + 2; i++) {
      const x = i * sp - off;
      ctx.beginPath();
      ctx.moveTo(x, groundY + 21);
      ctx.lineTo(x + 34, groundY + 21);
      ctx.moveTo(x + 22, groundY + 38);
      ctx.lineTo(x + 48, groundY + 38);
      ctx.stroke();
    }
  }

  function drawGroundDecor() {
    const sp = 96;
    const off = scroll % sp;
    ctx.strokeStyle = rgba(mixRgb(pal.mid, [255, 255, 255], 0.22), 0.9);
    ctx.lineWidth = 2.4;
    for (let i = -1; i < viewW / sp + 2; i++) {
      const x = i * sp - off + hash(i * 3.3) * 34;
      for (let g = 0; g < 3; g++) {
        const bx = x + g * 5;
        ctx.beginPath();
        ctx.moveTo(bx, groundY + 3);
        ctx.quadraticCurveTo(bx + 3, groundY - 8, bx + 7 - g, groundY - 13 - g * 2);
        ctx.stroke();
      }
    }
    // камешки
    ctx.fillStyle = rgba(pal.g3, 0.5);
    const sp2 = 148;
    const off2 = scroll % sp2;
    for (let i = -1; i < viewW / sp2 + 2; i++) {
      const x = i * sp2 - off2 + hash(i * 7.1) * 90;
      const y = groundY + 16 + hash(i * 5.7) * 26;
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + hash(i * 2.9) * 4, 3 + hash(i * 4.3) * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBushes() {
    const sp = 268;
    const off = scroll % sp;
    const col = mixRgb(pal.mid, pal.g2, 0.25);
    for (let i = -1; i < viewW / sp + 2; i++) {
      const x = i * sp - off + hash(i * 3.7) * 130;
      const s = 0.85 + hash(i * 5.3) * 0.5;
      ctx.fillStyle = rgba(col, 0.95);
      ctx.beginPath();
      ctx.ellipse(x, groundY - 9 * s, 21 * s, 15 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 18 * s, groundY - 6 * s, 15 * s, 11 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 17 * s, groundY - 5 * s, 13 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------- Птицы днём, светлячки ночью ----------------
  let birds = [];
  let fireflies = [];

  function buildBirds() {
    birds = [];
    for (let i = 0; i < 5; i++) {
      birds.push({
        n: hash(i * 7.3),
        alt: 0.10 + hash(i * 3.7) * 0.26,
        sp: 0.030 + hash(i * 5.1) * 0.05,
        s: 0.75 + hash(i * 11.1) * 0.6,
        ph: hash(i * 13.1) * 6.283
      });
    }
  }

  function drawBirds() {
    const a = (1 - pal.star) * 0.75;
    if (a < 0.05) return;
    ctx.strokeStyle = `rgba(48,44,58,${a})`;
    ctx.lineWidth = 2.2;
    for (const b of birds) {
      const nx = ((b.n - elapsed * b.sp) % 1 + 1) % 1;
      const x = nx * viewW;
      const y = 26 + b.alt * groundY;
      const flap = Math.sin(elapsed * 6 + b.ph) * 3.6 * b.s;
      ctx.beginPath();
      ctx.moveTo(x - 8 * b.s, y + flap);
      ctx.quadraticCurveTo(x - 3.4 * b.s, y - 3.4 * b.s, x, y);
      ctx.quadraticCurveTo(x + 3.4 * b.s, y - 3.4 * b.s, x + 8 * b.s, y + flap);
      ctx.stroke();
    }
  }

  function buildFireflies() {
    fireflies = [];
    for (let i = 0; i < 16; i++) {
      fireflies.push({
        nx: hash(i * 4.3),
        base: 12 + hash(i * 8.1) * 48,
        amp: 8 + hash(i * 2.9) * 22,
        sp: 0.5 + hash(i * 6.1) * 0.9,
        ph: hash(i * 9.7) * 6.283,
        r: 1.3 + hash(i * 3.3) * 1.5
      });
    }
  }

  function drawFireflies() {
    const a = pal.star;
    if (a < 0.06) return;
    for (const f of fireflies) {
      const x = (((f.nx * viewW + elapsed * f.sp * 13) % viewW) + viewW) % viewW;
      const y = groundY - f.base + Math.sin(elapsed * f.sp + f.ph) * f.amp;
      const tw = 0.45 + 0.55 * Math.sin(elapsed * 3 + f.ph);
      ctx.fillStyle = `rgba(255,236,150,${(a * tw * 0.35).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, f.r * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,224,${(a * tw * 0.92).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------- Падающая звезда (только ночью) ----------------
  const meteor = { life: 0, x: 0, y: 0, vx: 0, vy: 0 };

  function updateMeteor(dt) {
    if (meteor.life > 0) {
      meteor.life -= dt;
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      return;
    }
    if (pal && pal.star > 0.5 && Math.random() < dt * 0.22) {
      meteor.life = 0.9;
      meteor.x = rnd(viewW * 0.15, viewW * 0.95);
      meteor.y = rnd(20, groundY * 0.40);
      meteor.vx = rnd(-430, -230);
      meteor.vy = rnd(110, 220);
    }
  }

  function drawMeteor() {
    if (meteor.life <= 0) return;
    const a = clamp(meteor.life / 0.9, 0, 1) * 0.9;
    const len = 92;
    const nl = Math.hypot(meteor.vx, meteor.vy) || 1;
    const tx = meteor.x - (meteor.vx / nl) * len;
    const ty = meteor.y - (meteor.vy / nl) * len;
    const g = ctx.createLinearGradient(meteor.x, meteor.y, tx, ty);
    g.addColorStop(0, `rgba(255,255,235,${a.toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,255,235,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(meteor.x, meteor.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
  // =============================================================
  //  Бобёр-мастер 100balkonoff
  //  Рисуется в локальных координатах: ноги на базовой линии,
  //  тело уходит вверх примерно на 132 единицы.
  // =============================================================
  function drawLeg(x, y, angle, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = fill;
    ctx.strokeStyle = '#4d2f1d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-8, 0, 16, 32, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5b3724';
    ctx.beginPath();
    ctx.ellipse(2, 32, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawArm(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#9a623c';
    ctx.strokeStyle = '#4d2f1d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-7, -1, 15, 40, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a5635';
    ctx.beginPath();
    ctx.arc(1, 41, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHammerArm(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#9a623c';
    ctx.strokeStyle = '#4d2f1d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-6, 0, 15, 41, 8);
    ctx.fill();
    ctx.stroke();
    ctx.translate(4, 39);
    ctx.rotate(-0.35);
    ctx.fillStyle = '#b9783b';
    ctx.fillRect(-3, -26, 6, 36);
    ctx.fillStyle = '#777c82';
    ctx.strokeStyle = '#4f545a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-14, -34, 28, 10, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawEar(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#8c5938';
    ctx.strokeStyle = '#4d2f1d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c28a64';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEye(x, y, blinking) {
    ctx.save();
    ctx.translate(x, y);
    if (blinking) {
      ctx.strokeStyle = '#3d2718';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#231814';
      ctx.beginPath();
      ctx.arc(1.4, 1, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBeaver() {
    const phase = bob.runPhase;
    const runPose = bob.onGround ? Math.sin(phase) : 0;
    const bounce = bob.onGround ? Math.abs(Math.cos(phase * 2)) * 1.8 : 0;
    const base = bob.feetY + bounce;
    const bx = bob.x;

    // Мягкая тень на земле — помогает понять высоту прыжка.
    const airH = clamp((groundY - bob.feetY) / 150, 0, 1);
    ctx.fillStyle = `rgba(30,16,8,${(0.26 * (1 - airH * 0.72)).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(bx + 44, groundY + 4, 44 - airH * 14, 7 - airH * 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(bx, base - 70);

    // Хвост
    ctx.save();
    ctx.rotate(-0.18 + Math.sin(phase) * 0.045);
    ctx.fillStyle = '#8e5a37';
    ctx.strokeStyle = '#4d2f1d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(-18, 34, 28, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(58,36,22,.40)';
    ctx.lineWidth = 2;
    for (let i = -22; i <= 22; i += 11) {
      ctx.beginPath();
      ctx.moveTo(i, 7);
      ctx.lineTo(i + 5, 56);
      ctx.stroke();
    }
    ctx.restore();

    // Ноги
    const leg1 = runPose * 0.74;
    const leg2 = -runPose * 0.74;
    drawLeg(16, 55, leg1, '#7e4e2f');
    drawLeg(56, 55, leg2, '#7e4e2f');

    // Тело
    ctx.fillStyle = '#98613b';
    ctx.strokeStyle = '#4d2f1d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 12, 80, 74, 28);
    ctx.fill();
    ctx.stroke();

    // Красный комбинезон
    ctx.fillStyle = '#c91627';
    ctx.strokeStyle = '#8e0f1c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(17, 30, 54, 48, 13);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 9px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('100balkonoff', 44, 56);

    // Пуговицы лямок
    ctx.fillStyle = '#f2b5bc';
    ctx.beginPath();
    ctx.arc(21, 31, 4.2, 0, Math.PI * 2);
    ctx.arc(65, 31, 4.2, 0, Math.PI * 2);
    ctx.fill();

    // Руки: одна с молотком
    drawArm(8, 34, 0.34 * runPose);
    drawHammerArm(78, 36, -0.28 * runPose);

    // Голова
    ctx.fillStyle = '#a36b43';
    ctx.strokeStyle = '#4d2f1d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(45, -4, 44, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    drawEar(17, -29, -0.08);
    drawEar(73, -29, 0.08);

    // Морда и зубы
    ctx.fillStyle = '#d28d5b';
    ctx.beginPath();
    ctx.ellipse(45, 2, 28, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d211d';
    ctx.beginPath();
    ctx.ellipse(45, -3, 10.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(36, 7, 8, 13);
    ctx.fillRect(46, 7, 8, 13);
    ctx.strokeStyle = 'rgba(60,40,28,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(45, 7);
    ctx.lineTo(45, 20);
    ctx.stroke();

    // Глаза с редким морганием
    const blinking = bob.blink > 0;
    drawEye(30, -10, blinking);
    drawEye(60, -10, blinking);

    // Красная кепка с логотипом
    ctx.fillStyle = '#c91627';
    ctx.strokeStyle = '#8e0f1c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(45, -22, 27, Math.PI, Math.PI * 2);
    ctx.lineTo(74, -22);
    ctx.quadraticCurveTo(61, -10, 45, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('100', 45, -28);

    ctx.restore();
  }

  // =============================================================
  //  Частицы: пыль из-под лап, щепки, искры
  // =============================================================
  const COLORS = {
    dust: ['#e8d9bd', '#d9c4a0', '#c9b18c'],
    chip: ['#8b5a33', '#b98250', '#5f3a22', '#c9955f'],
    spark: ['#ffe9a8', '#ffd06a']
  };

  function burst(x, y, n, colors) {
    const cols = colors || COLORS.chip;
    for (let i = 0; i < n; i++) {
      const a = rnd(-Math.PI, 0.35);
      const v = rnd(60, 300);
      particles.push({
        x, y,
        vx: Math.cos(a) * v * 0.9,
        vy: Math.sin(a) * v - rnd(20, 160),
        life: rnd(0.35, 0.95),
        max: 1,
        size: rnd(2.5, 6),
        rot: rnd(0, 6.28),
        spin: rnd(-9, 9),
        color: cols[(Math.random() * cols.length) | 0],
        grav: 900,
        round: true
      });
    }
    for (const p of particles) if (p.max === 1) p.max = p.life;
  }

  function dustPuff(x, y, n) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x: x + rnd(-8, 8), y: y + rnd(-4, 2),
        vx: rnd(-70, -10),
        vy: rnd(-46, -6),
        life: rnd(0.25, 0.6),
        max: 1,
        size: rnd(2.4, 5),
        rot: 0, spin: 0,
        color: COLORS.dust[(Math.random() * 3) | 0],
        grav: 60,
        round: true
      });
    }
    for (const p of particles) if (p.max === 1) p.max = p.life;
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt - speed * dt * 0.35;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    if (particles.length) particles = particles.filter(p => p.life > 0);
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (0.6 + a * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // =============================================================
  //  Препятствия: бревно, толстое бревно и ворона
  // =============================================================
  function levelNow() {
    return 1 + Math.floor(meters / 150);
  }

  function gapDistance() {
    const base = viewW * (1.05 + Math.random() * 0.40);
    const tight = 0.12 * clamp((speedF - SPEED_START) / (SPEED_MAX - SPEED_START), 0, 1);
    return base * (1 - tight);
  }

  function spawnObstacle(kind, x) {
    const lvl = levelNow();
    // Ворону пускаем только когда рядом нет другого препятствия: иначе
    // связка «бревно + ворона» становится непроходимой.
    const busy = obstacles.some(o => o.x < viewW * 0.88);
    if (!kind) {
      const r = Math.random();
      if (lvl >= FIRST_CROW_LEVEL && !busy && r < 0.26) kind = 'crow';
      else if (lvl >= 2 && (spawnedCount % 3 === 2 || r < 0.22)) kind = 'big';
      else kind = 'log';
    }
    spawnedCount += 1;
    if (kind === 'crow') {
      obstacles.push({
        kind: 'crow',
        x: x === undefined ? viewW + 60 : x,
        w: 62,
        h: 52,
        y: groundY - 192 - Math.random() * 12,
        ph: Math.random() * 6.28,
        extra: CROW_BOOST,
        passed: false
      });
      return 'crow';
    }
    const big = kind === 'big';
    obstacles.push({
      kind: big ? 'big' : 'log',
      x: x === undefined ? viewW + 46 : x,
      w: big ? rnd(70, 96) : rnd(42, 62),
      h: big ? rnd(60, 84) : rnd(30, 44),
      passed: false
    });
    return big ? 'big' : 'log';
  }

  function drawLog(o) {
    const top = groundY - o.h;
    ctx.fillStyle = 'rgba(38,20,9,.20)';
    ctx.beginPath();
    ctx.ellipse(o.x + o.w / 2, groundY + 5, o.w * 0.6, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(0, top, 0, groundY);
    grad.addColorStop(0, '#bd8551');
    grad.addColorStop(0.45, '#8b5a33');
    grad.addColorStop(1, '#5c3820');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#482817';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(o.x, top, o.w, o.h, Math.min(11, o.h / 2));
    ctx.fill();
    ctx.stroke();

    // торец с кольцами
    const cx = o.x + o.w - 2;
    const cy = top + o.h / 2;
    ctx.fillStyle = '#c9955f';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 7, o.h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6d3f24';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3.4, Math.max(2, o.h / 4 - 2), 0, 0, Math.PI * 2);
    ctx.stroke();

    // кора
    ctx.strokeStyle = 'rgba(45,25,13,.42)';
    ctx.lineWidth = 2;
    for (let y = top + 13; y < groundY - 9; y += 15) {
      ctx.beginPath();
      ctx.moveTo(o.x + 9, y);
      ctx.lineTo(o.x + o.w - 16, y + 3);
      ctx.stroke();
    }
  }

  function drawCrow(o) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const flap = Math.sin(elapsed * 15 + o.ph);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#2b2b38';
    ctx.strokeStyle = '#141420';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-15, -3);
    ctx.lineTo(-31, -7);
    ctx.lineTo(-28, 3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(17, -5, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0a33c';
    ctx.beginPath();
    ctx.moveTo(24, -7);
    ctx.lineTo(34, -3.5);
    ctx.lineTo(24, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(19, -7, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(19.7, -7, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b3b4e';
    ctx.save();
    ctx.rotate(-flap * 0.55);
    ctx.beginPath();
    ctx.ellipse(-1, -9, 17, 6.5, -0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate(flap * 0.55);
    ctx.beginPath();
    ctx.ellipse(-1, -9, 17, 6.5, 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawObstacles() {
    for (const o of obstacles) {
      if (o.kind === 'crow') drawCrow(o);
      else drawLog(o);
    }
  }

  // Бобёр с сальто после двойного прыжка
  function drawBeaverAnimated() {
    if (bob.spin > 0.002 && bob.spin < 0.998) {
      const cx = bob.x + 45;
      const cy = bob.feetY - 62;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(bob.spin * Math.PI * 2);
      ctx.translate(-cx, -cy);
      drawBeaver();
      ctx.restore();
      return;
    }
    drawBeaver();
  }

  // =============================================================
  //  Физика и столкновения
  // =============================================================
  function performJump() {
    if (bob.onGround || bob.coyote > 0) {
      bob.vy = -JUMP1;
      bob.onGround = false;
      bob.coyote = 0;
      bob.jumpCount = 1;
      bob.spin = 0;
      bob.spinning = false;
      airTime = 0;
      dustPuff(bob.x + 18, groundY - 2, 4);
      sfxJump();
      return true;
    }
    if (!bob.onGround && bob.jumpCount === 1) {
      bob.vy = -JUMP2;
      bob.jumpCount = MAX_JUMPS;
      bob.spinning = true;
      bob.spin = 0.001;
      dustPuff(bob.x + 40, bob.feetY, 6);
      sfxJump2();
      return true;
    }
    return false;
  }

  function jump() {
    if (state === 'ready' || state === 'over') { startGame(); return; }
    if (state === 'paused') { resumeGame(); return; }
    performJump();
  }

  function hitbox() {
    return {
      l: bob.x + 34,
      r: bob.x + bob.w - 26,
      t: bob.feetY - 112,
      b: bob.feetY - 4
    };
  }

  function collides(o) {
    const h = hitbox();
    const ol = o.x + 7;
    const or = o.x + o.w - 7;
    let ot, ob;
    if (o.kind === 'crow') {
      ot = o.y;
      ob = o.y + o.h;
    } else {
      ot = groundY - o.h;
      ob = groundY;
    }
    return h.r > ol && h.l < or && h.b > ot + 6 && h.t < ob - 4;
  }

  // =============================================================
  //  Обновление мира
  // =============================================================
  function update(dt) {
    elapsed += dt;
    dayT = (dayT + dt / DAY_CYCLE) % 1;
    updateMeteor(dt);

    // Скорость растёт: примерно вдвое за SPEED_RAMP единиц пути.
    speedF = Math.min(SPEED_MAX, SPEED_START * (1 + distance / SPEED_RAMP));
    speed = speedF * viewW;

    const d = speed * dt;
    distance += d;
    meters = distance / PX_PER_M;
    scroll += d;

    const lvl = levelNow();
    if (lvl > level) {
      level = lvl;
      flash = Math.max(flash, 0.28);
      sfxLevel();
      showToast(`УРОВЕНЬ ${lvl} • СКОРОСТЬ ×${(speedF / SPEED_START).toFixed(2)}`, 1.8);
      burst(bob.x + 60, bob.feetY - 90, 10, COLORS.spark);
    }
    if (!recordShown && best > 0 && meters > best) {
      recordShown = true;
      showToast('НОВЫЙ РЕКОРД!', 1.8);
      sfxRecord();
    }

    // Спавн препятствий
    if (distance >= nextSpawn) {
      const kind = spawnObstacle();
      let gap = gapDistance();
      if (kind === 'crow') {
        gap *= 1.3;
        if (!crowShown) {
          crowShown = true;
          showToast('ВОРОНА! ПОД НЕЙ НЕ ПРЫГАЙ', 2.2);
        }
      }
      spawnGaps.push(gap);
      nextSpawn = distance + gap;
    }

    for (const o of obstacles) {
      o.x -= d * (o.extra ? 1 + o.extra : 1);
      if (!o.passed && o.x + o.w < bob.x + 20) {
        o.passed = true;
        burst(o.x + o.w / 2, groundY - (o.kind === 'crow' ? 20 : o.h / 2), o.kind === 'crow' ? 5 : 8, COLORS.chip);
        sfxDodge();
      }
    }
    if (obstacles.length) obstacles = obstacles.filter(o => o.x > -180);

    // Прыжок
    const wasOnGround = bob.onGround;
    bob.vy += GRAVITY * dt;
    bob.feetY += bob.vy * dt;
    if (bob.feetY >= groundY) {
      bob.feetY = groundY;
      bob.vy = 0;
      if (!wasOnGround) dustPuff(bob.x + 30, groundY - 2, 6);
      bob.onGround = true;
      bob.jumpCount = 0;
      bob.coyote = 0.10;
      bob.spin = 0;
      bob.spinning = false;
      if (airTime > 0.55) dustPuff(bob.x + 50, groundY - 2, 3);
      airTime = 0;
    } else {
      bob.onGround = false;
      airTime += dt;
      bob.coyote = Math.max(0, bob.coyote - dt);
    }
    if (bob.spinning) {
      bob.spin += dt / 0.55;
      if (bob.spin >= 1) { bob.spin = 0; bob.spinning = false; }
    }

    bob.runPhase += dt * (speed / viewW) * 40;
    bob.blink += dt;
    if (bob.blink > 4.5) bob.blink = bob.blink > 4.68 ? 0 : 4.52;

    if (toast.life > 0) toast.life = Math.max(0, toast.life - dt);
    updateParticles(dt);
    shake = Math.max(0, shake - dt * 3.2);
    flash = Math.max(0, flash - dt * 2.2);

    // Столкновения
    for (const o of obstacles) {
      if (collides(o)) { gameOver(o.kind === 'crow'); return; }
    }

    // Пыль из-под лап на бегу
    if (bob.onGround && Math.random() < dt * 22) {
      dustPuff(bob.x + 8, groundY - 3, 1);
    }

    updateHud();
  }

  // =============================================================
  //  Отрисовка кадра
  // =============================================================
  function render() {
    pal = paletteAt(dayT);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    if (shake > 0.001) {
      const s = shake * 8;
      ctx.translate(rnd(-s, s), rnd(-s, s));
    }

    drawSky();
    drawMeteor();
    drawHills();
    drawPines(0.14, 54, 34, 76, mixRgb(pal.far, [0, 0, 0], 0.10), groundY - 18, 0.92, 0.85);
    drawPines(0.42, 132, 64, 122, mixRgb(pal.mid, [0, 0, 0], 0.05), groundY - 3, 0.95, 0.78);
    drawBirds();
    drawGround();
    drawGroundDecor();
    drawBushes();
    drawFireflies();
    drawObstacles();
    drawParticles();
    drawBeaverAnimated();

    // Индикатор невыполненного прыжка: лёгкое кольцо под ногами
    if (!bob.onGround && bob.jumpCount === 1) {
      ctx.strokeStyle = 'rgba(255,255,255,.30)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(bob.x + 45, groundY + 3, 30, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Всплывающая подсказка
    if (toast.life > 0) {
      const a = clamp(toast.life / 0.45, 0, 1) * clamp((toast.total - toast.life) / 0.2, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = '900 20px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(toast.text).width + 40;
      ctx.fillStyle = 'rgba(24,10,12,.72)';
      ctx.beginPath();
      ctx.roundRect(viewW / 2 - w / 2, 22, w, 42, 21);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(toast.text, viewW / 2, 49);
      ctx.globalAlpha = 1;
    }

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (flash > 0.01) {
      ctx.fillStyle = `rgba(255,245,238,${(flash * 0.45).toFixed(3)})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function drawStaticFrame() {
    pal = paletteAt(dayT);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    drawSky();
    drawMeteor();
    drawHills();
    drawPines(0.14, 54, 34, 76, mixRgb(pal.far, [0, 0, 0], 0.10), groundY - 18, 0.92, 0.85);
    drawPines(0.42, 132, 64, 122, mixRgb(pal.mid, [0, 0, 0], 0.05), groundY - 3, 0.95, 0.78);
    drawBirds();
    drawGround();
    drawGroundDecor();
    drawBushes();
    drawFireflies();
    drawObstacles();
    drawBeaver();
  }

  // =============================================================
  //  Главный цикл
  // =============================================================
  function loop(now) {
    raf = 0;
    if (state !== 'running') return;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.033);

    update(dt);
    render();
    if (state === 'running') raf = requestAnimationFrame(loop);
  }

  // =============================================================
  //  Ввод
  // =============================================================
  canvas.addEventListener('pointerdown', e => {
    if (e && e.preventDefault) e.preventDefault();
    jump();
  }, { passive: false });

  if (restart) restart.addEventListener('click', () => { startGame(); });

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.code || e.key;
    if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW' || e.key === ' ') {
      if (e.preventDefault) e.preventDefault();
      jump();
      return;
    }
    if (k === 'Escape' || k === 'KeyP' || e.key === 'p' || e.key === 'P') {
      if (state === 'running') pauseGame();
      else if (state === 'paused') resumeGame();
      return;
    }
    if (k === 'KeyM' || e.key === 'm' || e.key === 'M' || e.key === 'ь') toggleMute();
  });

  if (muteBtn) muteBtn.addEventListener('click', e => { if (e && e.preventDefault) e.preventDefault(); toggleMute(); });

  // Пауза, когда игра ушла из вида или вкладка свёрнута
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (!en.isIntersecting && state === 'running') pauseGame();
      }
    }, { threshold: 0.25 });
    io.observe(canvas);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'running') pauseGame();
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      if (state !== 'running') drawStaticFrame();
    }, 90);
  });

  // =============================================================
  //  Запуск
  // =============================================================
  buildStars();
  buildClouds();
  buildBirds();
  buildFireflies();
  resize();
  updateMuteBtn();
  showStartScreen();
  updateHud();
  drawStaticFrame();

  // Отладочные «крючки»: включаются только при ?debug=1 в адресе страницы.
  if (typeof location !== 'undefined' && /[?&]debug=1/.test(location.search || '')) {
    window.__bobr = {
      bob,
      startGame, pauseGame, resumeGame, jump, spawnObstacle, resize, drawStaticFrame, render,
      setPhase: v => { dayT = v; },
      setMeters: v => { meters = v; distance = v * PX_PER_M; },
      obstacles: () => obstacles,
      state: () => state,
      meters: () => meters,
      speedF: () => speedF,
      speed: () => speed,
      speedMax: () => SPEED_MAX,
      spawnGaps: () => spawnGaps,
      blocked: () => spawnGaps,
      dayT: () => dayT,
      viewW: () => viewW,
      viewH: () => viewH,
      groundY: () => groundY
    };
    const m = /[?&]phase=([\d.]+)/.exec(location.search || '');
    if (m) dayT = parseFloat(m[1]) || 0;
  }
})();
