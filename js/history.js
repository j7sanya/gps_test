// ============================================================
// history.js — история заездов: список, окно заезда с тепловой картой скорости.
//
// Что хранится (только на этом телефоне):
//  • последние 20 заездов;
//  • заезды, которыми вы побили рекорд (🏆), и заезды со звёздочкой (⭐) — они не удаляются
//    (закреплённых не больше 40).
// Для карты скорости сохраняется трек заезда: точка раз в секунду (время, координаты, скорость).
// Трек хранится в сжатом виде (целые числа-«шаги»), примерно 10–15 байт на точку.
// ============================================================
STR.history = (function () {
  const C = STR.config, U = STR.u, $ = U.$;
  const LIMIT = 20, PIN_MAX = 40;
  const PAL = [[43, 108, 255], [25, 200, 255], [34, 211, 107], [255, 210, 26], [255, 122, 26], [255, 45, 61]];   // синий → красный
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const idOf = r => r.id || String(r.date);
  const bb = (on, fn) => { try { if (on) { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(fn); } else { STR.tg.BackButton.offClick(fn); STR.tg.BackButton.hide(); } } catch (e) {} };

  // ---------- Хранилище треков ----------
  const readTracks = () => { try { return JSON.parse(localStorage.getItem(C.STORE_TRACKS) || '{}') || {}; } catch (e) { return {}; } };
  const writeTracks = o => { try { localStorage.setItem(C.STORE_TRACKS, JSON.stringify(o)); return true; } catch (e) { return false; } };

  // Сжатие трека: целые «шаги» (время — 0.1 с, координаты — 1e-5° ≈ 1 м, скорость — км/ч)
  function enc(pts) {
    let st = pts.length > 6000 ? 2 : 1;     // очень длинные заезды прореживаем
    const p = []; let pt = 0, pla = 0, plo = 0;
    for (let i = 0; i < pts.length; i += st) {
      const q = pts[i], t = Math.round(q.t / 100), la = Math.round(q.lat * 1e5), lo = Math.round(q.lon * 1e5);
      p.push(t - pt, la - pla, lo - plo, Math.round(q.v || 0));
      pt = t; pla = la; plo = lo;
    }
    return p;
  }
  function dec(p) {
    const out = []; let t = 0, la = 0, lo = 0;
    for (let i = 0; i + 3 < p.length; i += 4) {
      t += p[i]; la += p[i + 1]; lo += p[i + 2];
      out.push({ t: t * 100, lat: la / 1e5, lon: lo / 1e5, v: p[i + 3] });
    }
    return out;
  }

  // Какие заезды хранить: последние 20 + закреплённые (⭐ в первую очередь, затем 🏆 рекорды)
  function keepSet(runs) {
    const keep = new Set(runs.slice(-LIMIT).map(idOf));
    const stars = runs.filter(r => r.star);
    const recs = runs.filter(r => r.record && !r.star).reverse();
    stars.concat(recs.slice(0, Math.max(0, PIN_MAX - stars.length))).forEach(r => keep.add(idOf(r)));
    return keep;
  }
  function prune() {
    const keep = keepSet(STR.api.getRuns()), tr = readTracks();
    let changed = false;
    Object.keys(tr).forEach(id => { if (!keep.has(id)) { delete tr[id]; changed = true; } });
    if (changed) writeTracks(tr);
  }

  // Сохранить трек только что законченного заезда
  function save(meta, pts) {
    try {
      if (!pts || pts.length < 2) return;
      const tr = readTracks();
      tr[meta.id] = enc(pts);
      // не хватило места в памяти телефона: освобождаем самые старые незакреплённые треки
      const runs = STR.api.getRuns();
      const pinned = new Set(runs.filter(r => r.star || r.record).map(idOf));
      const order = runs.map(idOf).filter(id => tr[id] && id !== meta.id && !pinned.has(id));
      while (!writeTracks(tr) && order.length) delete tr[order.shift()];
      prune();
    } catch (e) {}
  }

  // Заезды, которые показываем в истории (новые сверху)
  function visible() {
    const runs = STR.api.getRuns(), keep = keepSet(runs);
    return runs.filter(r => keep.has(idOf(r))).sort((a, b) => b.date - a.date);
  }
  const trackOf = r => { const t = readTracks()[idOf(r)]; return t ? dec(t) : null; };

  // ---------- Раскраска по скорости ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  function color(f) {
    f = Math.max(0, Math.min(1, f));
    const n = PAL.length - 1, i = Math.min(n - 1, Math.floor(f * n)), k = f * n - i, a = PAL[i], b = PAL[i + 1];
    return `rgb(${[0, 1, 2].map(j => Math.round(lerp(a[j], b[j], k))).join(',')})`;
  }
  // Сглаженная скорость (по 3 точкам) и «потолок» шкалы: максимум заезда, округлённый вверх до 10
  function prep(pts) {
    const sm = pts.map((p, i) => { const a = pts[i - 1] || p, c = pts[i + 1] || p; return (a.v + p.v + c.v) / 3; });
    const vmax = Math.max(10, Math.ceil(Math.max(...sm) / 10) * 10);
    return { sm, vmax };
  }
  // Склеиваем подряд идущие отрезки одного цвета: [{ col, pts:[[lat,lon]…] }]
  function groups(pts, sm, vmax) {
    const out = []; let cur = null;
    for (let i = 1; i < pts.length; i++) {
      const b = Math.min(15, Math.floor((sm[i] / vmax) * 16));
      if (!cur || cur.b !== b) { cur = { b, col: color((b + 0.5) / 16), pts: [[pts[i - 1].lat, pts[i - 1].lon]] }; out.push(cur); }
      cur.pts.push([pts[i].lat, pts[i].lon]);
    }
    return out;
  }
  // Миниатюра трассы для списка (SVG)
  function thumb(pts) {
    if (!pts || pts.length < 2) return '<div class="hi-nothumb">🗺️</div>';
    const { sm, vmax } = prep(pts), lat0 = pts[0].lat, kx = Math.cos(lat0 * Math.PI / 180);
    const xy = pts.map(p => [p.lon * kx, -p.lat]);
    const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const W = 84, H = 68, pad = 7, s = Math.min((W - 2 * pad) / ((x1 - x0) || 1e-9), (H - 2 * pad) / ((y1 - y0) || 1e-9));
    const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    const P = xy.map(p => [(p[0] - x0) * s + ox, (p[1] - y0) * s + oy]);
    let svg = `<svg viewBox="0 0 ${W} ${H}"><polyline points="${P.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="#1d222b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
    let cur = null, buf = [];
    const flush = () => { if (cur !== null && buf.length > 1) svg += `<polyline points="${buf.join(' ')}" fill="none" stroke="${color((cur + 0.5) / 16)}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`; };
    for (let i = 1; i < P.length; i++) {
      const b = Math.min(15, Math.floor((sm[i] / vmax) * 16)), a = P[i - 1].map(v => v.toFixed(1)).join(','), c = P[i].map(v => v.toFixed(1)).join(',');
      if (b !== cur) { flush(); cur = b; buf = [a]; }
      buf.push(c);
    }
    flush();
    return svg + '</svg>';
  }

  // ---------- Оформление ----------
  function when(ts) {
    const d = new Date(ts), now = new Date(), hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return 'сегодня ' + hm;
    if (diff === 1) return 'вчера ' + hm;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '') + ' ' + hm;
  }
  function tag(r) {
    if (r.valid === false) return '<span class="tag t-bad">не засчитан</span>';
    if (r.record) return '<span class="tag t-rec">🏆 РЕКОРД</span>';
    const rec = STR.api.getRecord(r.routeId);
    if (rec && rec.time) { const d = r.time - rec.time; if (d > 0.005) return `<span class="tag t-bad">+${d.toFixed(2)}</span>`; }
    return '';
  }

  // ---------- Список ----------
  let filter = 'all', routeFilter = '';
  const listOpen = () => $('historyOverlay').classList.contains('open');

  function render() {
    const all = visible();
    // выбор трассы
    const sel = $('hiRoute'), names = [...new Map(all.map(r => [String(r.routeId), r.routeName])).entries()];
    sel.innerHTML = '<option value="">Все трассы</option>' + names.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('');
    if (!names.some(([id]) => id === routeFilter)) routeFilter = '';
    sel.value = routeFilter;
    document.querySelectorAll('#hiChips .chip').forEach(c => c.classList.toggle('on', c.dataset.f === filter));

    let rows = all;
    if (filter === 'pin') rows = rows.filter(r => r.star || r.record);
    if (filter === 'rec') rows = rows.filter(r => r.record);
    if (routeFilter) rows = rows.filter(r => String(r.routeId) === routeFilter);

    const tr = readTracks(), pins = all.filter(r => r.star).length;
    $('hiNote').textContent = `Последние ${LIMIT} заездов + закреплённые (🏆 рекорды и ⭐) · хранятся на этом телефоне · ⭐ ${pins}/${PIN_MAX}`;
    const box = $('hiList'); box.innerHTML = '';
    if (!rows.length) {
      box.innerHTML = `<div class="none">${all.length ? 'По этому фильтру ничего нет.' : 'Пока нет заездов.<br>Проедьте любую трассу — она появится здесь.'}</div>`;
      return;
    }
    rows.forEach(r => {
      const id = idOf(r), t = tr[id] ? dec(tr[id]) : null, el = document.createElement('div');
      el.className = 'hi-run';
      el.innerHTML = `<div class="hi-th">${thumb(t)}</div>
        <div class="hi-m"><div class="hi-n"><span class="hi-name">${esc(r.routeName)}</span><i class="hi-when">${when(r.date)}</i></div>
        <div class="hi-tm">${U.fmtPrecise(r.time)}${tag(r)}</div>
        <div class="hi-s">${t ? `ср. ${Math.round(r.avgKmh)} км/ч · макс. ${Math.round(r.maxKmh)} км/ч` : 'без трека: заезд до обновления'}</div></div>
        <button class="hi-star${r.star ? ' on' : ''}" aria-label="Закрепить">${r.star ? '⭐' : '☆'}</button>`;
      el.querySelector('.hi-star').addEventListener('click', e => { e.stopPropagation(); toggleStar(r); });
      el.addEventListener('click', () => openRun(r));
      box.appendChild(el);
    });
  }

  function toggleStar(r) {
    const id = idOf(r), runs = STR.api.getRuns();
    if (!r.star) {
      if (runs.filter(x => x.star).length >= PIN_MAX) { U.setStatus(`Закреплено максимум ${PIN_MAX} заездов. Снимите ⭐ с ненужных.`); return; }
      STR.api.updateRun(id, { star: true });
      refresh();
      return;
    }
    // снимаем звёздочку: если заезд не входит в «последние 20» и не рекордный, он удалится
    const recentIds = new Set(runs.slice(-LIMIT).map(idOf));
    const willDrop = !recentIds.has(id) && !r.record;
    const apply = () => { STR.api.updateRun(id, { star: false }); prune(); refresh(); };
    if (!willDrop) return apply();
    const text = 'Снять звёздочку? Этот заезд будет удалён из истории.';
    const tg = STR.tg;
    if (tg && tg.showConfirm) { try { return tg.showConfirm(text, ok => ok && apply()); } catch (e) {} }
    if (window.confirm(text)) apply();
  }
  function refresh() { render(); if (runOpen()) { const r = STR.api.getRuns().find(x => idOf(x) === curId); if (r) drawStar(r); } }

  function open() { render(); $('historyOverlay').classList.add('open'); bb(true, close); }
  function close() { $('historyOverlay').classList.remove('open'); bb(false, close); }

  // ---------- Окно заезда ----------
  const runOpen = () => $('runOverlay').classList.contains('open');
  let rmap = null, rheat = null, rcase = null, rmarks = [], curId = null;

  function drawStar(r) { const b = $('rvStar'); b.textContent = r.star ? '⭐' : '☆'; b.classList.toggle('on', !!r.star); }

  function openRun(r) {
    curId = idOf(r);
    const t = trackOf(r);
    $('rvTitle').textContent = r.routeName;
    $('rvTime').textContent = U.fmtPrecise(r.time);
    $('rvWhen').textContent = `${when(r.date)} · ${(r.dist / 1000).toFixed(1)} км`;
    $('rvTag').innerHTML = tag(r);
    $('rvMax').textContent = t ? Math.round(r.maxKmh) : '—';
    $('rvAvg').textContent = t ? Math.round(r.avgKmh) : '—';
    $('rvDist').textContent = (r.dist / 1000).toFixed(1);
    drawStar(r);
    $('rvStar').onclick = () => toggleStar(STR.api.getRuns().find(x => idOf(x) === curId) || r);
    $('rvMapBox').classList.toggle('nomap', !t);
    $('runOverlay').classList.add('open');
    bb(false, close); bb(true, closeRun);
    if (!t) return;
    setTimeout(() => drawHeat(t, r), 40);   // карта рисуется, когда окно уже видно
  }

  function drawHeat(pts, r) {
    if (!window.maplibregl) return;
    const M = STR.map;
    if (!rmap) {
      rmap = new maplibregl.Map({ container: 'runMap', style: M.styleUrl(), center: [0, 0], zoom: 2, attributionControl: false, maxZoom: 19, dragRotate: false, pitchWithRotate: false });
      rmap.touchZoomRotate.disableRotation();
      rcase = M.lineLayer(rmap, 'rcase', { 'line-color': '#0b0d10', 'line-width': 10, 'line-opacity': 0.85 });
      rheat = M.lineLayer(rmap, 'rheat', { 'line-color': ['get', 'c'], 'line-width': 6, 'line-opacity': 1 });
      rmap.on('style.load', () => M.russianLabels(rmap));
      M.onStyle(fresh => { if (fresh && rmap) rmap.setStyle(M.styleUrl(), { diff: false }); });   // стиль сменили в настройках
    }
    rmap.resize();
    rmarks.forEach(m => m.remove()); rmarks = [];
    const { sm, vmax } = prep(pts), all = pts.map(p => [p.lat, p.lon]);
    rcase.set(M.fc([M.line(all.map(M.ll))]));
    rheat.set(M.fc(groups(pts, sm, vmax).filter(g => g.pts.length > 1).map(g => { const f = M.line(g.pts.map(M.ll)); f.properties.c = g.col; return f; })));
    const pin = (p, el) => rmarks.push(new maplibregl.Marker({ element: el }).setLngLat(M.ll(p)).addTo(rmap));
    const d1 = document.createElement('div'); d1.className = 'rt-pt st big'; pin(all[0], d1);
    const d2 = document.createElement('div'); d2.className = 'rt-pt fn big'; pin(all[all.length - 1], d2);
    let mi = 0; sm.forEach((v, i) => { if (v > sm[mi]) mi = i; });
    const tag = document.createElement('div'); tag.className = 'rv-pin'; tag.textContent = '⚡ ' + Math.round(pts[mi].v) + ' км/ч';
    rmarks.push(new maplibregl.Marker({ element: tag, anchor: 'bottom', offset: [0, -6] }).setLngLat(M.ll(all[mi])).addTo(rmap));
    rmap.fitBounds(M.boundsOf(all), { padding: 34, duration: 0, maxZoom: 18 });
    $('rvLegMax').textContent = vmax + ' км/ч';
  }

  function closeRun() { $('runOverlay').classList.remove('open'); bb(false, closeRun); bb(true, close); }

  $('historyClose').addEventListener('click', close);
  $('runClose').addEventListener('click', closeRun);
  $('hiRoute').addEventListener('change', e => { routeFilter = e.target.value; render(); });
  document.querySelectorAll('#hiChips .chip').forEach(c => c.addEventListener('click', () => { filter = c.dataset.f; render(); }));
  prune();

  return { open, close, save, isOpen: listOpen };
})();
