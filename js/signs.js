// ============================================================
// signs.js — знаки поворотов как в ралли.
//  • рисует 5 знаков (форма и цвет зависят от сложности, см. turns.js);
//  • ленту из трёх ближайших поворотов под секундомером заезда;
//  • те же знаки на проекции (#hTn в hud.js-оверлее);
//  • короткий «радио-сигнал» как у F1, когда в ленте появляется новый поворот;
//  • окно настроек: включить/выключить, расстояние показа 50–300 м, звук.
// Данные о поворотах даёт STR.run.getNextTurns() (расстояние считается вдоль трассы).
// ============================================================
STR.signs = (function () {
  const U = STR.u, $ = U.$;
  const KEY = 'strace_signs_v1';
  const DEF = { on: true, dist: 150, sound: true };
  const DISTS = [50, 100, 150, 200, 250, 300];
  let cfg = Object.assign({}, DEF);
  try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); if (x) cfg = Object.assign(cfg, x); } catch (e) {}
  if (DISTS.indexOf(cfg.dist) < 0) cfg.dist = DEF.dist;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };
  const bb = (on, fn) => { try { if (on) { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(fn); } else { STR.tg.BackButton.offClick(fn); STR.tg.BackButton.hide(); } } catch (e) {} };

  // ---------- Знаки ----------
  const COL = ['#22d36b', '#ffb400', '#ff7a1a', '#ff2d3d', '#d946ef'];
  const TH = [30, 55, 90, 125, 155];                    // угол стрелки на каждом уровне (для рисунка)
  const NAMES = ['Лёгкий', 'Средний', 'Резкий', 'Очень резкий', 'Шпилька'];
  const RANGES = ['15–40°', '40–75°', '75–110°', '110–145°', 'больше 145°'];
  const SHAPE = {
    1: '<circle cx="24" cy="24" r="21"',
    2: '<rect x="4" y="4" width="40" height="40" rx="12"',
    3: '<polygon points="24,4 45,42 3,42"',
    4: '<polygon points="14,4 34,4 46,24 34,44 14,44 2,24"',
    5: '<polygon points="24,1 47,24 24,47 1,24"'
  };
  const FIT = { 1: 'translate(5,5) scale(.8)', 2: 'translate(4.5,4.5) scale(.81)', 3: 'translate(2.6,11.5) scale(.58)', 4: 'translate(1.9,-3.2) scale(.85)' };
  const HAIRPIN = '<path d="M17.5 32 V22 A6.5 6.5 0 0 1 30.5 22 V27" fill="none" stroke="#fff" stroke-width="6.5"/><polygon points="23.5,26 37.5,26 30.5,35" fill="#fff"/>';
  const f1 = a => a.map(v => v.toFixed(1)).join(',');

  // Белая стрелка поворота «вправо»; изгиб соответствует углу уровня
  function arrow(L) {
    const th = TH[L - 1] * Math.PI / 180, sn = Math.sin(th), cs = Math.cos(th), hp = TH[L - 1] > 120;
    const px = hp ? 17 : 24, py = hp ? 19 : 26, len = 15;
    const ex = px + len * sn, ey = py - len * cs, ax = px + 9 * sn, ay = py - 9 * cs;
    const tip = [ex + sn * 7, ey - cs * 7], b1 = [ex + cs * 7, ey + sn * 7], b2 = [ex - cs * 7, ey - sn * 7];
    return '<path d="M' + px + ' 41 L' + px + ' ' + (py + 9) + ' Q' + px + ' ' + py + ' ' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' L' + ex.toFixed(1) + ' ' + ey.toFixed(1) +
      '" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><polygon points="' + f1(tip) + ' ' + f1(b1) + ' ' + f1(b2) + '" fill="#fff"/>';
  }
  // Знак: level 1–5, dir 'L' | 'R'. Размер задаёт CSS родителя (.tn-sg)
  function sign(level, dir) {
    const body = level === 5 ? HAIRPIN : '<g transform="' + FIT[level] + '">' + arrow(level) + '</g>';
    const inner = dir === 'L' ? '<g transform="translate(48,0) scale(-1,1)">' + body + '</g>' : body;
    return '<svg viewBox="0 0 48 48" aria-hidden="true">' + SHAPE[level] + ' fill="#0b0d10" stroke="' + COL[level - 1] + '" stroke-width="4" stroke-linejoin="round"/>' + inner + '</svg>';
  }

  // ---------- Звук: короткий «радио-пик» как у F1 (щелчок и тон) ----------
  let ac = null, lastBeep = 0;
  function unlock() {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended' || ac.state === 'interrupted') ac.resume();
    } catch (e) {}
  }
  // iPhone разрешает звук только после касания экрана: ловим любое касание
  ['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
  function beep(force) {
    if (!ac || (!cfg.sound && !force)) return;
    const now = Date.now();
    if (!force && now - lastBeep < 1200) return;   // в цепочке поворотов не трещим подряд
    lastBeep = now;
    try {
      const t = ac.currentTime;
      const len = Math.floor(ac.sampleRate * 0.03), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const ns = ac.createBufferSource(), bp = ac.createBiquadFilter(), ng = ac.createGain();
      ns.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 2600; ng.gain.value = 0.18;
      ns.connect(bp); bp.connect(ng); ng.connect(ac.destination); ns.start(t);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = 1750;
      g.gain.setValueAtTime(0.0001, t + 0.03); g.gain.exponentialRampToValueAtTime(0.28, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(ac.destination); o.start(t + 0.03); o.stop(t + 0.18);
    } catch (e) {}
  }

  // ---------- Лента на экране заезда и на проекции ----------
  let announced = new Set();   // повороты, о которых уже просигналили
  let keyStrip = '', keyHud = '';
  const fmtD = d => { if (d <= 0) return 'сейчас'; d = d < 100 ? Math.round(d / 5) * 5 : Math.round(d / 10) * 10; return d + ' м'; };

  function html(list) {
    const one = (t, i) => {
      const d = t.dist < 100 ? Math.round(t.dist / 5) * 5 : Math.round(t.dist / 10) * 10;
      const txt = i === 0 ? fmtD(t.dist) : String(Math.max(5, d));
      return '<div class="tn-it' + (i === 0 ? ' main' : '') + (i === 0 && t.dist <= 50 ? ' near' : '') + '"><span class="tn-sg">' + sign(t.level, t.dir) + '</span><b class="tn-d">' + txt + '</b></div>';
    };
    // три колонки: пусто | текущий поворот строго по центру | следующие повороты справа
    return '<span></span>' + one(list[0], 0) + '<div class="tn-next">' + list.slice(1).map((t, i) => one(t, i + 1)).join('') + '</div>';
  }

  function update() {
    const st = $('turnStrip'), hud = $('hTn');
    if (!st) return;
    const list = cfg.on && STR.run ? STR.run.getNextTurns(cfg.dist, 3) : [];
    if (hud) hud.style.display = cfg.on ? '' : 'none';

    if (!list.length) {
      st.classList.remove('open');
      if (keyStrip) { st.innerHTML = ''; keyStrip = ''; }
      if (hud && keyHud) { hud.innerHTML = ''; keyHud = ''; }
      return;
    }

    // Новый поворот в ленте — один короткий сигнал
    let fresh = false;
    list.forEach(t => { if (!announced.has(t.id)) { announced.add(t.id); fresh = true; } });
    if (fresh) beep();

    const h = html(list);
    if (h !== keyStrip) { st.innerHTML = h; keyStrip = h; }
    if (hud && h !== keyHud) { hud.innerHTML = h; keyHud = h; }
    st.classList.add('open');
    const b = $('runBanner');
    if (b) st.style.top = (b.offsetTop + b.offsetHeight + 10) + 'px';   // под секундомером, какой бы высоты он ни был
  }

  // Новый заезд / конец заезда: забываем, о каких поворотах уже сигналили
  function reset() { announced = new Set(); }

  // ---------- Окно настроек ----------
  const isOpen = () => $('signsOverlay').classList.contains('open');
  function renderSet() {
    $('signsBody').innerHTML = `
      <label class="tgl-row"><div><b>Знаки поворотов</b><small>Ближайшие повороты на экране заезда и на проекции</small></div><input type="checkbox" id="sgOn" ${cfg.on ? 'checked' : ''}><i></i></label>
      <h4>За сколько метров показывать</h4>
      <div class="seg2">${DISTS.map(d => `<span class="chip${cfg.dist === d ? ' on' : ''}" data-dist="${d}">${d} м</span>`).join('')}</div>
      <div class="hud-note">Знак появляется, когда до начала поворота остаётся выбранное расстояние. На высокой скорости выбирайте побольше.</div>
      <label class="tgl-row" style="margin-top:14px"><div><b>Звуковой сигнал</b><small>Короткий радио-сигнал, когда появляется новый поворот</small></div><input type="checkbox" id="sgSnd" ${cfg.sound ? 'checked' : ''}><i></i></label>
      <button id="sgBeep" class="sg-test">▶ Проверить сигнал</button>
      <h4>Шкала сложности</h4>
      <div class="sg-legend">${[1, 2, 3, 4, 5].map(l => `<div class="sg-row"><span class="tn-sg">${sign(l, l % 2 ? 'R' : 'L')}</span><div><b>${l} · ${NAMES[l - 1]}</b><small>${RANGES[l - 1]}</small></div></div>`).join('')}</div>
      <div class="hud-note">Уровень считается по углу поворота. Знаки работают только в заезде по трассе.</div>`;
  }
  $('signsBody').addEventListener('click', e => {
    const c = e.target.closest('[data-dist]');
    if (c) { cfg.dist = +c.dataset.dist; save(); renderSet(); update(); return; }
    if (e.target.id === 'sgBeep') { unlock(); beep(true); }
  });
  $('signsBody').addEventListener('change', e => {
    if (e.target.id === 'sgOn') { cfg.on = e.target.checked; save(); update(); }
    if (e.target.id === 'sgSnd') { cfg.sound = e.target.checked; save(); }
  });
  function openSettings() { renderSet(); $('signsOverlay').classList.add('open'); bb(true, closeSettings); }
  function closeSettings() {
    $('signsOverlay').classList.remove('open'); bb(false, closeSettings);
    if (STR.settings) STR.settings.resume();
  }
  $('signsClose').addEventListener('click', closeSettings);

  return { update, reset, openSettings, isOpen, sign, cfg: () => Object.assign({}, cfg), beep: () => { unlock(); beep(true); } };
})();
