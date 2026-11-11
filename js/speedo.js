// ============================================================
// speedo.js — спидометр в нижней панели: 6 видов и выбор акцентного цвета.
// Выбор (вид + цвет) запоминается на телефоне. Окно настроек открывается из бокового меню.
// Все виды рисуются кодом (без картинок), цвет задаётся переменной --sp.
// ============================================================
STR.speedo = (function () {
  const U = STR.u, $ = U.$;
  const KEY = 'strace_speedo_v1';
  const SCALE = 240;                       // верх шкалы, км/ч
  const DEF = { style: 'italic', color: '#ff2d3d' };
  const STYLES = [
    ['italic', '1 · Крупный курсив + шкала'],
    ['seg',    '2 · Приборная панель (7 сегментов)'],
    ['semi',   '3 · Полукруг'],
    ['dial',   '4 · Круглый циферблат со стрелкой'],
    ['led',    '5 · Гоночные LED-огни'],
    ['thin',   '6 · Минимал, тонкий шрифт']
  ];
  const COLORS = ['#ff2d3d', '#ff7a1a', '#ffc21a', '#22d36b', '#19c8ff', '#3b82ff', '#a855f7', '#ff4fa3', '#ffffff'];

  let cfg = Object.assign({}, DEF);
  try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); if (x) cfg = Object.assign(cfg, x); } catch (e) {}
  if (!STYLES.some(s => s[0] === cfg.style)) cfg.style = DEF.style;
  if (!/^#[0-9a-f]{6}$/i.test(cfg.color)) cfg.color = DEF.color;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };

  // ---------- Цвет: основной, тусклый (выключенные сегменты) и свечение ----------
  function applyColor(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const mix = (k) => '#' + [r, g, b].map((v, i) => Math.round(v * k + [17, 20, 26][i] * (1 - k)).toString(16).padStart(2, '0')).join('');
    const st = document.documentElement.style;
    st.setProperty('--sp', hex);
    st.setProperty('--sp-dim', mix(0.16));
    st.setProperty('--sp-glow', `rgba(${r},${g},${b},.55)`);
  }

  // ---------- Геометрия дуг ----------
  const pol = (cx, cy, r, a) => { const t = a * Math.PI / 180; return [cx + r * Math.cos(t), cy - r * Math.sin(t)]; };
  const arc = (cx, cy, r, a0, a1) => {
    const [x0, y0] = pol(cx, cy, r, a0), [x1, y1] = pol(cx, cy, r, a1);
    return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${Math.abs(a0 - a1) > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
  };
  function ticks(cx, cy, r, a0, a1, n, len, every) {
    let o = '';
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n, big = i % every === 0;
      const [x0, y0] = pol(cx, cy, r, a), [x1, y1] = pol(cx, cy, r - (big ? len * 1.6 : len), a);
      o += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="${big ? 'tk major' : 'tk'}"/>`;
    }
    return o;
  }
  const clamp01 = v => Math.max(0, Math.min(1, v / SCALE));

  // ---------- Построители видов. Каждый возвращает { set(v), mode(text) } ----------
  const B = {};

  B.italic = root => {
    root.innerHTML = '<div class="sp-num"><b>0</b><small>км/ч</small></div><div class="sp-bar"><i></i></div>';
    const b = root.querySelector('b'), bar = root.querySelector('.sp-bar i');
    return { set(v) { b.textContent = v; bar.style.width = (clamp01(v) * 100) + '%'; }, mode() {} };
  };

  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  const POLY = {
    a: '10,6 50,6 44,14 16,14', g: '10,50 50,50 44,58 16,58', d: '10,94 50,94 44,86 16,86',
    f: '8,8 15,16 15,46 8,52 4,48 4,12', b: '52,8 56,12 56,48 52,52 45,46 45,16',
    e: '8,52 15,58 15,84 8,92 4,88 4,56', c: '52,52 56,56 56,88 52,92 45,84 45,58'
  };
  B.seg = root => {
    let g = '';
    for (let d = 0; d < 3; d++) for (const k of 'abcdefg') g += `<polygon data-d="${d}" data-k="${k}" transform="translate(${d * 68},0)" points="${POLY[k]}"/>`;
    root.innerHTML = `<svg class="glow" viewBox="0 0 204 100"><g transform="skewX(-7) translate(8,0)">${g}</g></svg><div class="sp-unit">км/ч</div>`;
    const polys = [[], [], []];
    root.querySelectorAll('polygon').forEach(p => { polys[+p.dataset.d][p.dataset.k] = p; });
    return {
      set(v) {
        const s = String(Math.min(999, v)).padStart(3, ' ');
        for (let d = 0; d < 3; d++) {
          const lit = s[d] === ' ' ? '' : SEG[s[d]];
          for (const k of 'abcdefg') polys[d][k].classList.toggle('on', lit.includes(k));
        }
      }, mode() {}
    };
  };

  B.semi = root => {
    const cx = 195, cy = 118, r = 100;
    root.innerHTML = `<svg class="glow" viewBox="0 0 390 150">
      <path d="${arc(cx, cy, r, 180, 0)}" class="trk" stroke-width="14"/>
      <path class="fill" d="${arc(cx, cy, r, 180, 0)}" pathLength="100" stroke-width="14" stroke-dasharray="0 100"/>
      ${ticks(cx, cy, r - 14, 180, 0, 24, 5, 4)}
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="big" font-size="62" letter-spacing="-2">0</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="sm" font-size="13" letter-spacing="2">КМ/Ч</text>
      <text x="${cx - r}" y="${cy + 16}" text-anchor="middle" class="dm" font-size="11">0</text>
      <text x="${cx + r}" y="${cy + 16}" text-anchor="middle" class="dm" font-size="11">${SCALE}</text></svg>`;
    const fill = root.querySelector('.fill'), t = root.querySelector('.big');
    return { set(v) { const p = clamp01(v) * 100; fill.setAttribute('stroke-dasharray', p + ' 100'); fill.style.opacity = p < 0.4 ? 0 : 1; t.textContent = v; }, mode() {} };
  };

  B.dial = root => {
    const cx = 195, cy = 90, r = 82, a0 = 225, a1 = -45;
    let nums = '';
    for (let i = 0; i <= 6; i++) { const [x, y] = pol(cx, cy, r - 27, a0 + (a1 - a0) * i / 6); nums += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" class="dm" font-size="11" font-weight="600">${i * 40}</text>`; }
    root.innerHTML = `<svg class="glow" viewBox="0 0 390 172">
      <path d="${arc(cx, cy, r, a0, a1)}" class="trk" stroke-width="8"/>
      <path class="fill" d="${arc(cx, cy, r, a0, a1)}" pathLength="100" stroke-width="8" stroke-dasharray="0 100"/>
      ${ticks(cx, cy, r - 10, a0, a1, 48, 5, 8)}${nums}
      <line class="needle" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="9" class="hub" stroke-width="3"/>
      <text x="${cx}" y="${cy + 44}" text-anchor="middle" class="big" font-size="34">0</text>
      <text x="${cx}" y="${cy + 60}" text-anchor="middle" class="sm" font-size="10" letter-spacing="2">КМ/Ч</text></svg>`;
    const fill = root.querySelector('.fill'), nd = root.querySelector('.needle'), t = root.querySelector('.big');
    return {
      set(v) {
        const f = clamp01(v), a = a0 + (a1 - a0) * f, [x, y] = pol(cx, cy, r - 12, a), [x2, y2] = pol(cx, cy, -10, a);
        nd.setAttribute('x1', x2.toFixed(1)); nd.setAttribute('y1', y2.toFixed(1)); nd.setAttribute('x2', x.toFixed(1)); nd.setAttribute('y2', y.toFixed(1));
        fill.setAttribute('stroke-dasharray', (f * 100) + ' 100'); fill.style.opacity = f < 0.004 ? 0 : 1;
        t.textContent = v;
      }, mode() {}
    };
  };

  B.led = root => {
    root.innerHTML = '<div class="sp-leds">' + '<i></i>'.repeat(24) + '</div><div class="sp-row"><b>0</b><span>км/ч</span></div>';
    const leds = root.querySelectorAll('.sp-leds i'), b = root.querySelector('b');
    return { set(v) { const on = Math.round(24 * clamp01(v)); leds.forEach((l, i) => l.classList.toggle('on', i < on)); b.textContent = v; }, mode() {} };
  };

  B.thin = root => {
    root.innerHTML = '<div class="sp-top"><div class="sp-num"><b>0</b></div><div class="sp-side"><i>КМ/Ч</i><em></em></div></div>';
    const b = root.querySelector('b'), em = root.querySelector('em');
    return { set(v) { b.textContent = v; }, mode(t) { em.textContent = t ? '● ' + t : ''; } };
  };

  // Создать спидометр нужного вида внутри элемента root
  function create(root, style) {
    root.className = 'sp sp-' + style;
    return B[style](root);
  }

  // ---------- Главный спидометр в нижней панели ----------
  let main = null, last = 0, lastMode = '';
  function mount() {
    main = create($('speedo'), cfg.style);
    main.set(last); main.mode(lastMode);
  }
  const set = v => { last = v; if (main) main.set(v); };
  const setMode = t => { lastMode = t; if (main) main.mode(t); };

  // ---------- Окно настроек ----------
  const isOpen = () => $('speedoOverlay').classList.contains('open');
  const previews = {};

  function renderColors() {
    const box = $('spColors'); box.innerHTML = '';
    const preset = COLORS.includes(cfg.color.toLowerCase());
    COLORS.forEach(c => {
      const d = document.createElement('button');
      d.className = 'sw' + (cfg.color.toLowerCase() === c ? ' sel' : '');
      d.style.background = c; d.setAttribute('aria-label', c);
      d.addEventListener('click', () => pickColor(c));
      box.appendChild(d);
    });
    const lab = document.createElement('label');
    lab.className = 'sw custom' + (preset ? '' : ' sel');
    if (!preset) lab.style.background = cfg.color;
    lab.title = 'Свой цвет';
    lab.innerHTML = '<span>+</span><input type="color">';
    const inp = lab.querySelector('input'); inp.value = cfg.color;
    inp.addEventListener('input', () => pickColor(inp.value, true));
    box.appendChild(lab);
  }

  function renderStyles() {
    const box = $('spStyles'); box.innerHTML = '';
    STYLES.forEach(([key, title]) => {
      const card = document.createElement('div');
      card.className = 'sp-card' + (cfg.style === key ? ' sel' : '');
      card.innerHTML = `<div class="sp-cap"><b>${title}</b><span>${cfg.style === key ? '✓ выбран' : ''}</span></div><div class="sp-prev"></div>`;
      const pv = card.querySelector('.sp-prev');
      const p = create(pv, key); p.set(87); p.mode('ЗАЕЗД');
      card.addEventListener('click', () => pickStyle(key));
      box.appendChild(card);
    });
  }

  function pickColor(c, live) {
    cfg.color = c.toLowerCase(); applyColor(cfg.color); save();
    if (!live) renderColors();
    else { const l = document.querySelector('#spColors .custom'); if (l) { l.style.background = cfg.color; l.classList.add('sel'); } document.querySelectorAll('#spColors .sw:not(.custom)').forEach(x => x.classList.remove('sel')); }
  }
  function pickStyle(k) {
    if (cfg.style === k) return;
    cfg.style = k; save(); mount(); renderStyles();
  }

  function open() {
    renderColors(); renderStyles();
    $('speedoOverlay').classList.add('open');
    try { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(close); } catch (e) {}
  }
  function close() {
    $('speedoOverlay').classList.remove('open');
    try { STR.tg.BackButton.offClick(close); STR.tg.BackButton.hide(); } catch (e) {}
  }
  $('speedoClose').addEventListener('click', close);

  applyColor(cfg.color);
  mount();

  return { set, setMode, open, close, isOpen, get: () => Object.assign({}, cfg) };
})();
