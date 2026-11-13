// ============================================================
// search.js — поиск трасс: карточки с обложкой, сортировка и фильтры.
// Список рисуется в окне «Трассы» (routes.js вызывает STR.search.render).
// ============================================================
STR.search = (function () {
  const C = STR.config, U = STR.u, $ = U.$;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY_F = 'strace_rfilter_v1', KEY_CITY = 'strace_city_v1';
  const rj = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const wj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  const SORTS = [
    ['near', 'Сначала ближайшие'], ['pop', 'Сначала популярные'], ['new', 'Сначала новые'],
    ['short', 'Короткие → длинные'], ['long', 'Длинные → короткие'], ['abc', 'По алфавиту']
  ];
  const DEF = { q: '', sort: 'near', city: '', min: 0, max: null, ring: false, straight: false, mine: false, rode: false, norec: false };
  let F = Object.assign({}, DEF, rj(KEY_F, {}));
  const save = () => wj(KEY_F, F);

  let handlers = null, cities = rj(KEY_CITY, {}), cityBusy = false, posTimer = null;

  // ---------- Геометрия ----------
  const M_LAT = 111320;
  function dist(a, b) {
    const k = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
    return Math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * M_LAT * k);
  }
  const GRAD = [
    ['#1b2a4a', '#3a2a55', '#ff7a2d'], ['#0f2b2f', '#13404a', '#22d3a0'], ['#2a1c10', '#4a2a1a', '#ffb400'],
    ['#1a1d2a', '#2a3350', '#6a7bd0'], ['#2a1020', '#4a1a3a', '#ff4d8a'], ['#102a1c', '#1a4a2a', '#9bd84a']
  ];
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

  const meta = {};   // кэш: id -> { start, ring, svg, bg }
  function info(r) {
    if (meta[r.id] && meta[r.id].n === r.lines.length) return meta[r.id];
    const pts = [].concat(...r.lines);
    const start = pts[0], end = pts[pts.length - 1];
    const ring = dist(start, end) < 150;
    // обложка: линия трассы на цветном фоне
    const step = Math.max(1, Math.ceil(pts.length / 90));
    const s = pts.filter((_, i) => i % step === 0); s.push(end);
    const lat0 = s.reduce((a, p) => a + p[0], 0) / s.length, k = Math.cos(lat0 * Math.PI / 180);
    const xs = s.map(p => p[1] * k), ys = s.map(p => -p[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sc = 68 / Math.max(x1 - x0, y1 - y0, 1e-9);
    const ox = (100 - (x1 - x0) * sc) / 2, oy = (100 - (y1 - y0) * sc) / 2;
    const d = s.map((p, i) => (i ? 'L' : 'M') + ((xs[i] - x0) * sc + ox).toFixed(1) + ' ' + ((ys[i] - y0) * sc + oy).toFixed(1)).join('');
    const g = GRAD[hash(String(r.id)) % GRAD.length];
    const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><path d="${d}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/></svg>`;
    const bg = `radial-gradient(120% 90% at 20% 115%,${g[2]} 0,transparent 55%),linear-gradient(170deg,${g[0]},${g[1]})`;
    return (meta[r.id] = { n: r.lines.length, start, ring, svg, bg });
  }

  // ---------- Город по месту старта (определяем один раз и запоминаем) ----------
  const ckey = p => p[0].toFixed(2) + ',' + p[1].toFixed(2);
  const cityOf = r => cities[ckey(info(r).start)] || '';
  async function resolveCities(list) {
    if (cityBusy) return;
    const todo = []; const seen = {};
    list.forEach(r => { const p = info(r).start, k = ckey(p); if (!cities[k] && !seen[k]) { seen[k] = 1; todo.push([k, p]); } });
    if (!todo.length) return;
    cityBusy = true;
    let fails = 0;
    for (const [k, p] of todo) {
      if (!$('routesOverlay').classList.contains('open') || fails >= 3) break;
      try {
        const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=ru&lat=${p[0]}&lon=${p[1]}`)).json();
        const a = j.address || {};
        const name = a.city || a.town || a.village || a.municipality || a.county || a.state || '';
        if (name) { cities[k] = name; wj(KEY_CITY, cities); redraw(); if (sheetOpen()) renderSheet(); fails = 0; } else fails++;
      } catch (e) { fails++; }
      await new Promise(res => setTimeout(res, 1100));
    }
    cityBusy = false;
  }

  // ---------- Данные карточки ----------
  const pos = () => { try { return STR.gps.lastPos(); } catch (e) { return null; } };
  function created(r) { const m = /^local-(\d+)$/.exec(r.id); return m ? +m[1] : (r.created || 0); }
  function stats(r) {
    const runs = STR.api.getRuns().filter(x => String(x.routeId) === String(r.id)).length;
    const mine = STR.api.getRecordAny(r.id), top = STR.api.getBestAny(r.id);
    const rec = mine ? mine.rec : null, best = top ? top.x : null;   // лучший из двух видов старта
    const drivers = STR.api.getBoard(r.id, 'roll').length + STR.api.getBoard(r.id, 'stand').length;
    return { runs, rec, recMode: mine ? mine.mode : null, best, bestMode: top ? top.mode : null, drivers };
  }
  function row(r, p) {
    const i = info(r), st = stats(r);
    const km = r.distance / 1000;
    return { r, i, st, km, city: cityOf(r), d: p ? dist([p.lat, p.lon], i.start) : null, created: created(r) };
  }
  const fmtD = m => m < 1000 ? Math.round(m) + ' м' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' км';

  // ---------- Фильтрация и сортировка ----------
  function maxKm() { return Math.max(1, Math.ceil(Math.max(...STR.api.getRoutes().map(r => r.distance / 1000), 1))); }
  function pass(x) {
    if (F.q) { const q = F.q.toLowerCase(); if (!x.r.name.toLowerCase().includes(q) && !x.city.toLowerCase().includes(q)) return false; }
    if (F.city && x.city !== F.city) return false;
    if (x.km < F.min) return false;
    if (F.max !== null && x.km > F.max) return false;
    if (F.ring !== F.straight && (F.ring ? !x.i.ring : x.i.ring)) return false;
    if (F.mine && !(x.r.local || x.r.mine)) return false;
    if (F.rode && !(x.st.runs || x.st.rec)) return false;
    if (F.norec && x.st.rec) return false;
    return true;
  }
  const SORT = {
    near: (a, b) => (a.d === null ? 1e12 : a.d) - (b.d === null ? 1e12 : b.d) || a.r.name.localeCompare(b.r.name),
    pop: (a, b) => (b.st.drivers - a.st.drivers) || (b.st.runs - a.st.runs) || a.r.name.localeCompare(b.r.name),
    new: (a, b) => b.created - a.created || a.r.name.localeCompare(b.r.name),
    short: (a, b) => a.km - b.km, long: (a, b) => b.km - a.km,
    abc: (a, b) => a.r.name.localeCompare(b.r.name)
  };
  function result() {
    const p = pos();
    return STR.api.getRoutes().filter(r => r.lines && r.lines.length && r.lines[0].length).map(r => row(r, p)).filter(pass).sort(SORT[F.sort] || SORT.near);
  }

  const activeChips = () => {
    const c = [];
    if (F.city) c.push(['city', F.city]);
    if (F.min > 0 || F.max !== null) c.push(['dist', F.max === null ? `от ${F.min} км` : `${F.min}–${F.max} км`]);
    if (F.ring) c.push(['ring', 'Кольцо']);
    if (F.straight) c.push(['straight', 'Прямая']);
    if (F.mine) c.push(['mine', 'Только мои']);
    if (F.rode) c.push(['rode', 'Где я ездил']);
    if (F.norec) c.push(['norec', 'Без моего рекорда']);
    return c;
  };
  const clearKey = k => { if (k === 'dist') { F.min = 0; F.max = null; } else if (k === 'city') F.city = ''; else F[k] = false; };

  // ---------- Список ----------
  const plural = (n, a, b, c) => { const m = n % 100, d = n % 10; return (m > 10 && m < 20) ? c : d === 1 ? a : (d > 1 && d < 5) ? b : c; };

  const MI = { roll: '🏁', stand: '🚦' };
  function cardHTML(x) {
    const { r, i, st } = x;
    const best = st.best ? `🏆 ${U.fmtPrecise(st.best.time)} · ${esc(st.best.name)} ${MI[st.bestMode]}` : st.rec ? `🏆 ${U.fmtPrecise(st.rec.time)} · вы ${MI[st.recMode]}` : 'Станьте первым ⚡';
    const tags = [`<span class="tag">${i.ring ? '🔁 Кольцо' : '➡ Прямая'}</span>`];
    if (st.drivers) tags.push(`<span class="tag">👥 ${st.drivers} ${plural(st.drivers, 'результат', 'результата', 'результатов')}</span>`);
    if (st.runs) tags.push(`<span class="tag">🏁 ${st.runs} ${plural(st.runs, 'ваш заезд', 'ваших заезда', 'ваших заездов')}</span>`);
    if (r.public) tags.push(`<span class="tag">🌍 ${r.mine ? 'ваша' : esc(r.author)}</span>`);
    if (x.created && Date.now() - x.created < 7 * 864e5) tags.unshift('<span class="tag new">NEW</span>');
    return `<div class="rc" data-id="${esc(r.id)}">
      <div class="rc-main">
        <div class="rc-ph" style="background:${i.bg}">${i.svg}${x.d !== null ? `<span class="rc-badge">${fmtD(x.d)}</span>` : ''}</div>
        <div class="rc-in"><h3>${esc(r.name)}</h3>
          <div class="rc-meta">${x.city ? esc(x.city) + ' · ' : ''}${(x.km).toFixed(1)} км</div>
          <div class="rc-tags">${tags.join('')}</div>
          <div class="rc-rec${st.best || st.rec ? ' has' : ''}">${best}</div></div>
        <div class="rc-chev">›</div>
      </div></div>`;
  }

  function redraw() {
    if (!handlers) return;
    const box = $('routesList'), top = box.scrollTop;
    const all = STR.api.getRoutes();
    const list = result();
    renderTop(list.length, all.length);
    if (!all.length) { box.innerHTML = '<div class="empty">Трасс пока нет.\nЗапишите заезд кнопкой «Начать запись», затем нажмите «Сохранить как трассу»: она появится здесь вместе с первым рекордом.</div>'; return; }
    box.innerHTML = list.length ? list.map(cardHTML).join('') : '<div class="empty">Ничего не найдено.\nПопробуйте сбросить фильтры.</div>';
    box.scrollTop = top;
  }

  function renderTop(n, total) {
    $('rsQ').value !== F.q && ($('rsQ').value = F.q);
    $('rsSort').value = F.sort;
    const ch = activeChips();
    $('rsFiltBadge').textContent = ch.length || '';
    $('rsFiltBadge').style.display = ch.length ? '' : 'none';
    $('rsFilt').classList.toggle('on', ch.length > 0);
    $('rsChips').innerHTML = ch.length ? ch.map(([k, t]) => `<span class="chip on" data-k="${k}">${esc(t)} ✕</span>`).join('') + '<span class="chip" data-k="*">Сбросить</span>' : '';
    $('rsCnt').textContent = total ? `Найдено ${n} ${plural(n, 'трасса', 'трассы', 'трасс')}` + (n !== total ? ` из ${total}` : '') : '';
  }

  // ---------- Окно фильтров ----------
  const sheetOpen = () => $('rfOverlay').classList.contains('open');
  function renderSheet() {
    const routes = STR.api.getRoutes(), p = pos();
    const cnt = {}; routes.forEach(r => { const c = cityOf(r); if (c) cnt[c] = (cnt[c] || 0) + 1; });
    const names = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b));
    const mx = maxKm(), hi = F.max === null ? mx : Math.min(F.max, mx);
    const on = c => c ? ' on' : '';
    $('rfBody').innerHTML = `
      <h4>Сортировка</h4><div class="rad">${SORTS.map(([k, t]) => `<div class="${F.sort === k ? 'on' : ''}" data-sort="${k}">${t}</div>`).join('')}</div>
      <h4>Город <small>по месту старта</small></h4>
      <div class="chips wrap"><span class="chip${on(!F.city)}" data-city="">Все города</span>${names.map(n => `<span class="chip${on(F.city === n)}" data-city="${esc(n)}">${esc(n)} <i>${cnt[n]}</i></span>`).join('')}
        ${names.reduce((a, n) => a + cnt[n], 0) < routes.length ? '<span class="chip dim">определяю города…</span>' : ''}</div>
      <h4>Дистанция</h4>
      <div class="rng"><div class="rng-t"><b id="rfMinT">${F.min} км</b><b id="rfMaxT">${hi >= mx ? 'любая' : 'до ' + hi + ' км'}</b></div>
        <div class="rng-w"><input type="range" id="rfMin" min="0" max="${mx}" step="0.5" value="${Math.min(F.min, mx)}"><input type="range" id="rfMax" min="0" max="${mx}" step="0.5" value="${hi}"></div></div>
      <h4>Тип</h4><div class="chips wrap"><span class="chip${on(F.ring)}" data-t="ring">🔁 Кольцо</span><span class="chip${on(F.straight)}" data-t="straight">➡ Прямая</span></div>
      <h4>Показывать</h4><div class="chips wrap"><span class="chip${on(F.mine)}" data-t="mine">Только мои</span><span class="chip${on(F.rode)}" data-t="rode">Где я ездил</span><span class="chip${on(F.norec)}" data-t="norec">Без моего рекорда</span></div>`;
    updateCount();
  }
  function updateCount() {
    const n = result().length;
    $('rfShow').textContent = `Показать ${n} ${plural(n, 'трассу', 'трассы', 'трасс')}`;
  }
  const bbTg = (on, fn) => { try { if (on) { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(fn); } else STR.tg.BackButton.offClick(fn); } catch (e) {} };
  function openSheet() { renderSheet(); $('rfOverlay').classList.add('open'); bbTg(false, STR.routes.close); bbTg(true, closeSheet); }
  function closeSheet() { $('rfOverlay').classList.remove('open'); bbTg(false, closeSheet); bbTg(true, STR.routes.close); redraw(); }

  $('rfBody').addEventListener('click', e => {
    const t = e.target.closest('[data-sort],[data-city],[data-t]');
    if (!t) return;
    if (t.dataset.sort) F.sort = t.dataset.sort;
    else if (t.dataset.city !== undefined) F.city = t.dataset.city;
    else F[t.dataset.t] = !F[t.dataset.t];
    save(); renderSheet();
  });
  $('rfBody').addEventListener('input', e => {
    const mx = maxKm();
    let a = +$('rfMin').value, b = +$('rfMax').value;
    if (e.target.id === 'rfMin' && a > b) { b = a; $('rfMax').value = b; }
    if (e.target.id === 'rfMax' && b < a) { a = b; $('rfMin').value = a; }
    F.min = a; F.max = b >= mx ? null : b; save();
    $('rfMinT').textContent = a + ' км'; $('rfMaxT').textContent = b >= mx ? 'любая' : 'до ' + b + ' км';
    updateCount();
  });
  $('rfShow').addEventListener('click', closeSheet);
  $('rfClose').addEventListener('click', closeSheet);
  $('rfReset').addEventListener('click', () => { const s = F.sort; F = Object.assign({}, DEF, { sort: s, q: F.q }); save(); renderSheet(); });
  $('rsFilt').addEventListener('click', openSheet);

  // ---------- Верхняя панель и список ----------
  $('rsQ').addEventListener('input', e => { F.q = e.target.value.trim(); save(); redraw(); });
  $('rsSort').innerHTML = SORTS.map(([k, t]) => `<option value="${k}">↕ ${t}</option>`).join('');
  $('rsSort').addEventListener('change', e => { F.sort = e.target.value; save(); redraw(); });
  $('rsChips').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    if (c.dataset.k === '*') { const s = F.sort; F = Object.assign({}, DEF, { sort: s, q: F.q }); } else clearKey(c.dataset.k);
    save(); redraw();
  });
  // Клик по трассе открывает полную карточку (js/track.js)
  $('routesList').addEventListener('click', e => {
    const card = e.target.closest('.rc'); if (!card) return;
    const r = STR.api.getRoutes().find(x => String(x.id) === card.dataset.id);
    if (r) STR.track.open(r, handlers);
  });

  // Вызывается из routes.js при открытии окна и после изменений
  function render(h) {
    handlers = h;
    redraw();
    setTimeout(() => resolveCities(STR.api.getRoutes()), 0);   // после того как окно откроется
    // ждём GPS, чтобы показать расстояние до трасс
    clearInterval(posTimer);
    if (!pos()) {
      try { STR.gps.startWatching(); } catch (e) {}
      let n = 0;
      posTimer = setInterval(() => {
        if (pos() || ++n > 12 || !$('routesOverlay').classList.contains('open')) { clearInterval(posTimer); if (pos()) redraw(); }
      }, 1500);
    }
  }
  // Описание трассы для карточки: город, тип, расстояние до старта
  function describe(r) { const i = info(r), p = pos(); return { city: cityOf(r), ring: i.ring, d: p ? dist([p.lat, p.lon], i.start) : null }; }
  const fmtDist = fmtD;
  return { render, redraw, openSheet, describe, fmtDist };
})();
