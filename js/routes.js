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
    STR.api.loadBoard().then(ok => { if (ok && $('routesOverlay').classList.contains('open')) render(); });   // подтягиваем общие рекорды
    try { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(close); } catch (e) {}
  }
  function close() {
    $('routesOverlay').classList.remove('open');
    try { STR.tg.BackButton.offClick(close); STR.tg.BackButton.hide(); } catch (e) {}
  }

  function render() { STR.search.render({ showOnMap, remove, close }); }

  function showOnMap(r) {
    STR.map.showRoute(r.lines);
    close();
    U.setStatus(`Трасса «${r.name}» · ${U.fmtKm(r.distance)}`);
  }

  function remove(r) {
    const doDelete = async () => {
      const ok = await STR.api.deleteRoute(r.id);
      if (ok === false) { U.setStatus('Не удалось удалить трассу (нет связи с сервером).'); return; }
      STR.map.clearRoute();
      STR.run.refresh();
      render();
    };
    const text = r.public ? `Удалить публичную трассу «${r.name}»? Она пропадёт у всех, рекорды на ней тоже удалятся.`
                          : `Удалить трассу «${r.name}»?`;
    const tg = STR.tg;
    if (tg && tg.showConfirm) {
      try { return tg.showConfirm(text, ok => ok && doDelete()); } catch (e) {}
    }
    if (confirm(text)) doDelete();
  }

  // ---------- Сохранение новой трассы (записанной заездом или нарисованной на карте) ----------
  let pending = null;   // что сейчас сохраняем
  let onSaved = null;   // что сделать после сохранения (например, закрыть конструктор)

  // rec записи: { distance, timeSec, breaks, segs, geoms, snapTotal }
  // rec конструктора: { built: true, lines, distance }
  function openSaveDialog(rec, done) {
    pending = rec; onSaved = done || null;
    const snapped = !!rec.built || (rec.geoms && rec.geoms.length > 0);
    const dist = rec.built ? rec.distance : (snapped ? rec.snapTotal : rec.distance);
    const tooShort = dist < C.ROUTE_MIN_M;
    let info = `Длина: ${U.fmtKm(dist)}`;
    if (rec.built) {
      info += '\nМаршрут проложен по дорогам.';
    } else {
      info += ` · время: ${U.fmtTime(rec.timeSec * 1000)}\n` +
              (snapped ? 'Трасса будет сохранена по дорогам.' : 'Привязки к дорогам нет, сохранится исходный GPS-трек.') +
              (rec.breaks === 0 ? '\nЭто время станет первым рекордом.' : '\nВ записи были разрывы, поэтому рекорд не засчитывается.');
    }
    if (tooShort) info += `\n⛔ Трасса короче ${C.ROUTE_MIN_M} м, сохранить нельзя.`;
    $('saveInfo').textContent = info;
    $('saveOk').disabled = tooShort;
    $('routeName').value = 'Трасса ' + (STR.api.getRoutes().length + 1);

    // Галочка «Видят все»: только при подключённом сервере и внутри Telegram
    const row = $('saveShareRow'), box = $('savePublic');
    const canShare = STR.api.serverOn() && STR.tg && STR.tg.initData;
    row.style.display = canShare ? 'flex' : 'none';
    box.checked = false;
    if (canShare) {
      const used = STR.api.myPublicCount(), left = C.MAX_PUBLIC_ROUTES - used;
      box.disabled = left <= 0;
      row.classList.toggle('off', left <= 0);
      $('saveShareNote').textContent = left > 0
        ? `Трасса появится у всех игроков. Осталось публичных трасс: ${left} из ${C.MAX_PUBLIC_ROUTES}.`
        : `Лимит: ${C.MAX_PUBLIC_ROUTES} публичные трассы на игрока. Удалите одну из своих публичных, чтобы опубликовать новую. Эту можно сохранить только у себя.`;
    }
    $('saveDialog').classList.add('open');
  }

  function closeSaveDialog() { $('saveDialog').classList.remove('open'); }

  const PUBLISH_ERRORS = {
    limit: `Лимит: ${C.MAX_PUBLIC_ROUTES} публичные трассы на игрока. Удалите свою публичную трассу или сохраните эту только у себя (уберите галочку).`,
    nick: 'Чтобы публиковать трассы, нужен ник: напишите боту /start.',
    short: `Трасса короче ${C.ROUTE_MIN_M} м.`,
    name: 'Название должно быть от 3 до 40 символов.',
    default: 'Не удалось опубликовать трассу (нет связи с сервером). Попробуйте позже или сохраните её только у себя (уберите галочку).'
  };

  async function save() {
    if (!pending) return;
    const rec = pending;
    const snapped = !!rec.built || (rec.geoms && rec.geoms.length > 0);
    const dist = rec.built ? rec.distance : (snapped ? rec.snapTotal : rec.distance);
    if (dist < C.ROUTE_MIN_M) return;   // короче 300 м не сохраняем
    const name = $('routeName').value.trim() || ('Трасса ' + (STR.api.getRoutes().length + 1));

    // Геометрия: готовые линии конструктора; по дорогам, если привязка записи удалась; иначе сам GPS-трек
    const lines = rec.built ? rec.lines
      : snapped
        ? rec.geoms.map(g => U.thin(g, C.ROUTE_MAX_POINTS).map(c => [c[1], c[0]]))   // OSRM: [lon, lat] -> Leaflet: [lat, lon]
        : rec.segs.filter(seg => seg.length >= 2).map(seg => U.thin(seg, C.ROUTE_MAX_POINTS).map(p => [p.lat, p.lon]));
    const firstRecord = !rec.built && rec.breaks === 0 && rec.timeSec > 0
      ? { time: rec.timeSec, avgKmh: (dist / rec.timeSec) * 3.6, date: Date.now() } : null;

    let routeId, ok = true, publicNow = false;
    if ($('savePublic').checked && !$('savePublic').disabled) {
      $('saveOk').disabled = true;
      U.setStatus('Публикую трассу…');
      const r = await STR.api.publishRoute({ name, lines });
      $('saveOk').disabled = false;
      if (!r || !r.ok) {
        $('saveInfo').textContent = '⚠️ ' + (PUBLISH_ERRORS[r && r.error] || PUBLISH_ERRORS.default);
        $('savePublic').checked = false;
        return;   // окно остаётся открытым: можно сохранить только у себя
      }
      routeId = 'pub-' + r.id; publicNow = true;
    } else {
      routeId = 'local-' + Date.now();
      ok = STR.api.addRoute({ id: routeId, name, distance: dist, snapped, lines });
    }

    // Первый рекорд: только если в записи не было разрывов
    if (ok && firstRecord) {
      STR.api.submitRecord(routeId, firstRecord);
      if (publicNow) STR.api.sendRecord(routeId, firstRecord);
    }

    const done = onSaved; pending = null; onSaved = null;
    STR.run.refresh();   // новая трасса сразу доступна для заездов
    closeSaveDialog();
    STR.ui.showSave(false);
    U.setStatus(ok
      ? `Трасса «${name}» сохранена${publicNow ? ' и видна всем игрокам' : ''} · ${U.fmtKm(dist)}. Откройте «🏁 Трассы», чтобы увидеть её.`
      : 'Не удалось сохранить трассу в память телефона (хранилище недоступно).');
    if (done) done(lines);
  }

  return { open, close, openSaveDialog, closeSaveDialog, save };
})();
