// ============================================================
// track.js — полная карточка трассы (открывается кликом по трассе в списке «🏁 Трассы»).
// Сверху карта с маршрутом, ниже таблицы рекордов: «С хода» и «С места» (отдельные таблицы),
// кнопки «Старт с места» и «Поехать с хода». Заменяет прежнее окно «Рекорды».
// ============================================================
STR.track = (function () {
  const U = STR.u, $ = U.$;
  let cur = null, tab = 'roll', handlers = null;
  let tmap = null, tcase = null, tline = null, tmarks = [];

  const el = (cls, text, tag) => { const e = document.createElement(tag || 'div'); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const isOpen = () => $('trackOverlay').classList.contains('open');
  const bb = (on, fn) => { try { if (on) { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(fn); } else STR.tg.BackButton.offClick(fn); } catch (e) {} };

  // Ник-ссылка: нажатие открывает профиль игрока (свой ник — ваш профиль)
  function nickLink(x) {
    const e = el('link', x.name, 'span');
    e.onclick = ev => {
      ev.stopPropagation();
      if (x.mine) STR.profile.open();
      else if (x.num != null) STR.profile.openOther(x.num, x.name);
    };
    return e;
  }

  // ---------- Открыть / закрыть ----------
  function open(r, h) {
    cur = r; handlers = h || handlers;
    // сначала показываем ту вкладку, где у вас есть результат (или где вообще есть записи)
    const has = m => STR.api.getRecord(r.id, m) || STR.api.getMyRank(r.id, m) || STR.api.getBoard(r.id, m).length;
    tab = has('roll') || !has('stand') ? 'roll' : 'stand';
    head(); render();
    $('trackOverlay').classList.add('open');
    $('tcScroll').scrollTop = 0;
    bb(false, handlers && handlers.close); bb(true, back);
    setTimeout(drawMap, 40);   // карта рисуется, когда окно уже видно
    STR.api.loadBoard().then(ok => { if (ok && isOpen() && cur === r) render(); });   // свежие общие рекорды
  }
  // «Назад»: закрыть карточку и вернуться к списку трасс
  function back() {
    $('trackOverlay').classList.remove('open');
    bb(false, back);
    cur = null;
    if (STR.routes && STR.routes.isOpen()) bb(true, STR.routes.close);
  }
  // Закрыть всё (и карточку, и список): перед стартом заезда
  function closeAll() { back(); if (STR.routes) STR.routes.close(); }

  // ---------- Карта ----------
  function drawMap() {
    if (!cur || !window.maplibregl) return;
    const M = STR.map;
    if (!tmap) {
      tmap = new maplibregl.Map({ container: 'tcMap', style: M.styleUrl(), center: [0, 0], zoom: 2, attributionControl: false, interactive: false, maxZoom: 18 });
      tmap.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
      tcase = M.lineLayer(tmap, 'tcc', { 'line-color': '#0b0d10', 'line-width': 9, 'line-opacity': 0.8 });
      tline = M.lineLayer(tmap, 'tcl', { 'line-color': '#22d36b', 'line-width': 5, 'line-opacity': 1 });
      tmap.on('style.load', () => M.russianLabels(tmap));
      M.onStyle(fresh => { if (fresh && tmap) tmap.setStyle(M.styleUrl(), { diff: false }); });
    }
    tmap.resize();
    tmarks.forEach(m => m.remove()); tmarks = [];
    const all = [];
    cur.lines.forEach(l => all.push(...l));
    if (!all.length) return;
    const fcl = M.fc(cur.lines.filter(l => l.length > 1).map(l => M.line(l.map(M.ll))));
    tcase.set(fcl); tline.set(fcl);
    const pin = (p, cls) => { const d = document.createElement('div'); d.className = 'rt-pt big ' + cls; tmarks.push(new maplibregl.Marker({ element: d }).setLngLat(M.ll(p)).addTo(tmap)); };
    pin(all[0], 'st'); pin(all[all.length - 1], 'fn');
    tmap.fitBounds(M.boundsOf(all), { padding: { top: 70, bottom: 56, left: 36, right: 36 }, duration: 0, maxZoom: 18 });
  }

  // ---------- Шапка: название и сведения ----------
  function head() {
    const d = STR.search.describe(cur);
    $('tcTitle').textContent = cur.name;
    const parts = [];
    if (d.city) parts.push(d.city);
    parts.push(U.fmtKm(cur.distance), d.ring ? 'кольцо' : 'прямая');
    if (d.d !== null) parts.push('📍 ' + STR.search.fmtDist(d.d) + ' от старта');
    if (cur.public) parts.push('🌍 ' + (cur.mine ? 'ваша' : cur.author));
    $('tcMeta').textContent = parts.join(' · ');
  }

  // ---------- Шторка: вкладки и таблица ----------
  function render() {
    if (!cur) return;
    const r = cur, box = $('tcScroll'), top = box.scrollTop;
    box.textContent = '';

    const seg = el('tc-seg');
    [['roll', '🏁 С хода'], ['stand', '🚦 С места']].forEach(([k, t]) => {
      const b = el(tab === k ? 'on' : '', t);
      b.onclick = () => { tab = k; render(); };
      seg.appendChild(b);
    });
    box.appendChild(seg);

    const rows = STR.api.getBoard(r.id, tab);
    const rank = STR.api.getMyRank(r.id, tab);
    const mine = STR.api.getRecord(r.id, tab);
    const label = tab === 'stand' ? 'с места' : 'с хода';

    const me = el('tc-mine');
    const left = el();
    if (rank) {
      left.appendChild(el('tc-lbl', `Ваш рекорд ${label} · ${rank} место из ${rows.length}`));
      me.appendChild(left); me.appendChild(el('tc-time', U.fmtPrecise(rows[rank - 1].time)));
    } else if (mine) {
      left.appendChild(el('tc-lbl', `Ваш рекорд ${label} на этом телефоне`));
      left.appendChild(el('tc-sub', STR.api.serverOn() && !String(r.id).startsWith('local-') ? 'В общую таблицу попадёт после следующего рекорда.' : 'Свои трассы хранятся только на вашем телефоне.'));
      me.appendChild(left); me.appendChild(el('tc-time', U.fmtPrecise(mine.time)));
    } else {
      left.appendChild(el('tc-lbl', `Вас здесь нет (${label})`));
      left.appendChild(el('tc-sub', 'Проедьте трассу, чтобы попасть в таблицу.'));
      me.appendChild(left); me.appendChild(el('tc-time dim', '—'));
    }
    box.appendChild(me);

    if (!rows.length) {
      box.appendChild(el('tc-empty', STR.api.serverOn() ? 'Результатов пока нет.\nСтаньте первым!' : 'Таблица общих рекордов появится после подключения сервера.'));
    }
    rows.forEach((x, i) => {
      const row = el('tc-row' + (x.mine ? ' me' : ''));
      row.appendChild(el('tc-n', i === 0 ? '👑' : String(i + 1)));
      const who = el('tc-who');
      const nm = el('', undefined, 'b'); nm.appendChild(nickLink(x)); if (x.mine) nm.append(' (вы)');
      who.appendChild(nm);
      if (x.date) who.appendChild(el('', U.fmtDate(x.date), 'span'));
      row.appendChild(who);
      row.appendChild(el('tc-v', Math.round(x.avgKmh) + ' км/ч'));
      row.appendChild(el('tc-t', U.fmtPrecise(x.time)));
      box.appendChild(row);
    });

    box.appendChild(el('tc-note', 'С хода — время от пересечения линии старта. С места — от сигнала светофора. Таблицы отдельные.'));
    if (r.local || r.mine) {
      const d = el('tc-del', 'Удалить трассу');
      d.onclick = () => handlers && handlers.remove(r, back);
      box.appendChild(d);
    }
    box.scrollTop = top;
  }

  // ---------- Кнопки ----------
  $('tcBack').addEventListener('click', back);
  $('tcStand').addEventListener('click', () => { const r = cur; if (!r) return; closeAll(); STR.launch.choose(r.id, true); });
  $('tcRoll').addEventListener('click', () => {
    const r = cur; if (!r) return;
    back();
    if (handlers && handlers.showOnMap) handlers.showOnMap(r);   // показывает трассу и выбирает её для заезда с хода
    U.setStatus(`Трасса «${r.name}» выбрана. Проедьте линию старта: время пойдёт с неё.`);
  });

  return { open, back, close: back, isOpen };
})();
