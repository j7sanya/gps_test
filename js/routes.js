// ============================================================
// routes.js — окно «Трассы» (список) и сохранение новой трассы.
// Данные берёт и сохраняет через STR.api (см. api.js).
// ============================================================
STR.routes = (function () {
  const C = STR.config, U = STR.u, $ = U.$;

  // ---------- Окно со списком трасс ----------
  function open() {
    render();
    $('routesOverlay').classList.add('open');
    try { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(close); } catch (e) {}
  }
  function close() {
    $('routesOverlay').classList.remove('open');
    try { STR.tg.BackButton.offClick(close); STR.tg.BackButton.hide(); } catch (e) {}
  }

  function render() {
    const box = $('routesList');
    box.textContent = '';
    const list = STR.api.getRoutes();

    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'Трасс пока нет.\nЗапишите заезд кнопкой «Начать запись», затем нажмите ' +
                      '«Сохранить как трассу»: она появится здесь вместе с первым рекордом.';
      box.appendChild(e);
      return;
    }

    list.forEach(r => {
      const card = document.createElement('div');
      card.className = 'route-card';

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = r.name;

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = '📏 ' + U.fmtKm(r.distance);

      const recEl = document.createElement('div');
      recEl.className = 'rec';
      const rec = STR.api.getRecord(r.id);
      recEl.textContent = rec
        ? `🏆 Рекорд: ${U.fmtTime(rec.time * 1000)} · ${Math.round(rec.avgKmh)} км/ч средняя · ${U.fmtDate(rec.date)}`
        : '🏆 Рекорда пока нет';

      const acts = document.createElement('div');
      acts.className = 'acts';
      const show = document.createElement('button');
      show.textContent = 'Показать на карте';
      show.onclick = () => showOnMap(r);
      acts.appendChild(show);

      if (r.local) {   // удалять можно только свои трассы
        const del = document.createElement('button');
        del.className = 'del';
        del.textContent = 'Удалить';
        del.onclick = () => remove(r);
        acts.appendChild(del);
      }

      card.append(name, meta, recEl, acts);
      box.appendChild(card);
    });
  }

  function showOnMap(r) {
    STR.map.showRoute(r.lines);
    close();
    U.setStatus(`Трасса «${r.name}» · ${U.fmtKm(r.distance)}`);
  }

  function remove(r) {
    const doDelete = () => {
      STR.api.deleteRoute(r.id);
      STR.map.clearRoute();
      render();
    };
    const text = `Удалить трассу «${r.name}»?`;
    const tg = STR.tg;
    if (tg && tg.showConfirm) {
      try { return tg.showConfirm(text, ok => ok && doDelete()); } catch (e) {}
    }
    if (confirm(text)) doDelete();
  }

  // ---------- Сохранение записанного трека как трассы ----------
  let pending = null;   // итоги последней записи, которые сейчас сохраняем

  // rec: { distance, timeSec, breaks, segs, geoms, snapTotal }
  function openSaveDialog(rec) {
    pending = rec;
    const snapped = rec.geoms && rec.geoms.length > 0;
    const dist = snapped ? rec.snapTotal : rec.distance;
    const valid = rec.breaks === 0;
    $('saveInfo').textContent =
      `Длина: ${U.fmtKm(dist)} · время: ${U.fmtTime(rec.timeSec * 1000)}\n` +
      (snapped ? 'Трасса будет сохранена по дорогам.' : 'Привязки к дорогам нет, сохранится исходный GPS-трек.') +
      (valid ? '\nЭто время станет первым рекордом.' : '\nВ записи были разрывы, поэтому рекорд не засчитывается.');
    $('routeName').value = 'Трасса ' + (STR.api.getRoutes().length + 1);
    $('saveDialog').classList.add('open');
  }

  function closeSaveDialog() { $('saveDialog').classList.remove('open'); }

  function save() {
    if (!pending) return;
    const rec = pending;
    const snapped = rec.geoms && rec.geoms.length > 0;
    const dist = snapped ? rec.snapTotal : rec.distance;
    const name = $('routeName').value.trim() || ('Трасса ' + (STR.api.getRoutes().length + 1));

    // Геометрия: по дорогам, если привязка удалась; иначе сам GPS-трек
    const lines = snapped
      ? rec.geoms.map(g => U.thin(g, C.ROUTE_MAX_POINTS).map(c => [c[1], c[0]]))   // OSRM: [lon, lat] -> Leaflet: [lat, lon]
      : rec.segs.filter(seg => seg.length >= 2).map(seg => U.thin(seg, C.ROUTE_MAX_POINTS).map(p => [p.lat, p.lon]));

    const route = { id: 'local-' + Date.now(), name, distance: dist, snapped, lines };
    const ok = STR.api.addRoute(route);

    // Первый рекорд: только если в записи не было разрывов
    if (ok && rec.breaks === 0 && rec.timeSec > 0) {
      STR.api.submitRecord(route.id, { time: rec.timeSec, avgKmh: (dist / rec.timeSec) * 3.6, date: Date.now() });
    }

    pending = null;
    closeSaveDialog();
    STR.ui.showSave(false);
    U.setStatus(ok
      ? `Трасса «${name}» сохранена. Откройте «🏁 Трассы», чтобы увидеть её.`
      : 'Не удалось сохранить трассу в память телефона (хранилище недоступно).');
  }

  return { open, close, openSaveDialog, closeSaveDialog, save };
})();
