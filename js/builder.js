// ============================================================
// builder.js — создание трассы на карте: пользователь ставит точки (старт, промежуточные, финиш),
// сервис OSRM строит маршрут по дорогам, сразу показывается длина. Потом «Создать трассу».
// Последняя поставленная точка — всегда финиш. Нужно минимум 2 точки и длина от ROUTE_MIN_M.
// ============================================================
STR.builder = (function () {
  const C = STR.config, U = STR.u, $ = U.$;

  let active = false;
  let pts = [];            // точки пользователя: [{lat, lng}]
  let loop = false;        // кольцо: финиш там же, где старт
  let layer = null;        // слой Leaflet с маркерами и линией
  let cross = null;        // прицел в центре карты
  let route = null;        // построенный маршрут: { coords: [[lat, lon], ...], distance }
  let busy = false, error = '', seq = 0, timer = null;

  const map = () => STR.map.raw();
  const waypoints = () => (loop && pts.length >= 2 ? pts.concat([pts[0]]) : pts);

  // ---------- Вход и выход ----------
  function enter() {
    if (active) return;
    STR.run.cancel();
    STR.map.clearRoute();
    active = true; pts = []; loop = false; route = null; busy = false; error = '';
    $('bLoopBox').checked = false;
    layer = L.layerGroup().addTo(map());
    cross = document.createElement('div');
    cross.className = 'crosshair';
    cross.innerHTML = '<svg viewBox="0 0 34 34" fill="none" stroke="#ff2d3d" stroke-width="2.5" stroke-linecap="round"><circle cx="17" cy="17" r="6"/><path d="M17 2v8M17 24v8M2 17h8M24 17h8"/></svg>';
    map().getContainer().appendChild(cross);
    document.body.classList.add('building');
    map().invalidateSize();
    try { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(askExit); } catch (e) {}
    redraw();
  }

  function exit(silent) {
    if (!active) return;
    active = false;
    clearTimeout(timer); seq++;
    if (layer) { layer.remove(); layer = null; }
    if (cross) { cross.remove(); cross = null; }
    document.body.classList.remove('building');
    map().invalidateSize();
    try { STR.tg.BackButton.offClick(askExit); STR.tg.BackButton.hide(); } catch (e) {}
    pts = []; route = null;
    if (silent !== true) U.setStatus('Выберите трассу в списке «🏁 Трассы» или создайте новую кнопкой «+».');
  }

  function confirmBox(text, onYes) {
    const tg = STR.tg;
    if (tg && tg.showConfirm) { try { return tg.showConfirm(text, ok => ok && onYes()); } catch (e) {} }
    if (confirm(text)) onYes();
  }

  function askExit() {
    if (!pts.length) return exit();
    confirmBox('Выйти без сохранения? Поставленные точки пропадут.', exit);
  }

  // ---------- Точки ----------
  function addPoint() {
    if (!active) return;
    const c = map().getCenter();
    pts.push({ lat: c.lat, lng: c.lng });
    changed();
  }
  function undo() { if (pts.length) { pts.pop(); changed(); } }
  function clearAll() { if (pts.length) confirmBox('Убрать все точки?', () => { pts = []; changed(); }); }
  function removeAt(i) { pts.splice(i, 1); changed(); }
  function setLoop(v) { loop = !!v; changed(); }

  function changed() {
    route = null; error = '';
    clearTimeout(timer); seq++;
    redraw();
    if (waypoints().length >= 2) {
      busy = true; redraw();
      timer = setTimeout(fetchRoute, 350);   // небольшая задержка: не спрашиваем сервис после каждого движения пальца
    } else busy = false;
    redraw();
  }

  // ---------- Построение маршрута (OSRM) ----------
  async function fetchRoute() {
    const my = ++seq;
    const w = waypoints();
    const coords = w.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
    const radiuses = w.map(() => C.BUILD_RADIUS_M).join(';');
    const url = `${C.OSRM_ROUTE_URL}${coords}?overview=full&geometries=geojson&steps=false&radiuses=${radiuses}`;
    let res = null, err = '';
    try {
      const data = await (await fetch(url)).json();
      if (data.code === 'Ok' && data.routes && data.routes.length) {
        const r = data.routes[0];
        res = { coords: r.geometry.coordinates.map(c => [c[1], c[0]]), distance: r.distance };
      } else if (data.code === 'NoSegment') err = 'Рядом с одной из точек нет автодороги. Сдвиньте точку ближе к дороге.';
      else if (data.code === 'NoRoute') err = 'Между точками нет проезда по дорогам (односторонние улицы или нет связи). Поменяйте точки.';
      else err = 'Не удалось построить маршрут. Попробуйте поставить точки иначе.';
    } catch (e) {
      err = 'Нет связи с сервисом маршрутов. Проверьте интернет и нажмите «Повторить».';
    }
    if (my !== seq || !active) return;   // за это время точки изменились
    busy = false; route = res; error = err;
    redraw();
  }

  // ---------- Рисование ----------
  function icon(cls, label) {
    return L.divIcon({ className: '', html: `<div class="bm ${cls}">${label}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
  }

  function redraw() {
    if (!active) return;
    layer.clearLayers();
    if (route) L.polyline(route.coords, { color: '#22d36b', weight: 6, opacity: 0.95 }).addTo(layer);
    pts.forEach((p, i) => {
      const last = i === pts.length - 1;
      let cls = 'via', label = String(i);
      if (i === 0) { cls = 'start'; label = 'С'; }
      else if (last && !loop) { cls = 'fin'; label = 'Ф'; }
      const m = L.marker([p.lat, p.lng], { icon: icon(cls, label), draggable: true }).addTo(layer);
      m.on('dragend', () => { const ll = m.getLatLng(); pts[i] = { lat: ll.lat, lng: ll.lng }; changed(); });
      m.on('click', () => confirmBox(`Убрать точку «${label === 'С' ? 'Старт' : label === 'Ф' ? 'Финиш' : label}»?`, () => removeAt(i)));
    });
    updatePanel();
  }

  function updatePanel() {
    const len = route ? route.distance : 0;
    const enough = !!route && len >= C.ROUTE_MIN_M;
    $('buildLen').textContent = (len / 1000).toFixed(2) + ' км';

    let hint;
    if (busy) hint = 'Строю маршрут по дорогам…';
    else if (error) hint = error;
    else if (!pts.length) hint = 'Наведите прицел на место старта и нажмите «Поставить старт».';
    else if (pts.length === 1) hint = 'Теперь поставьте финиш. Между ними можно добавить промежуточные точки.';
    else if (route && len < C.ROUTE_MIN_M) hint = `Трасса слишком короткая: ${Math.round(len)} м. Нужно не меньше ${C.ROUTE_MIN_M} м.`;
    else if (route) hint = loop ? 'Кольцо: финиш там же, где старт. Можно создавать трассу.'
                              : 'Можно создавать трассу. Новая точка станет финишем, а перетаскивание точек меняет маршрут.';
    else hint = '';
    $('buildHint').textContent = hint;
    $('buildHint').classList.toggle('err', !!error || (!!route && !enough));

    $('bAdd').textContent = !pts.length ? '📍 Поставить старт' : pts.length === 1 ? '📍 Поставить финиш' : '📍 Добавить точку (новый финиш)';
    $('bCreate').disabled = !enough || busy;
    $('bUndo').disabled = !pts.length;
    $('bClear').disabled = !pts.length;
    $('bRetry').style.display = error && /связи/.test(error) ? 'inline-block' : 'none';
  }

  // «Создать трассу» → окно с названием и галочкой «Видят все»
  function create() {
    if (!route || route.distance < C.ROUTE_MIN_M) return;
    const lines = [U.thin(route.coords, C.BUILD_MAX_LINE_POINTS)];
    STR.routes.openSaveDialog({ built: true, lines, distance: route.distance }, savedLines => {
      exit(true);   // сообщение о сохранении оставляем
      STR.map.showRoute(savedLines, true);
    });
  }

  // ---------- Кнопки панели ----------
  $('bAdd').addEventListener('click', addPoint);
  $('bUndo').addEventListener('click', undo);
  $('bClear').addEventListener('click', clearAll);
  $('bLoopBox').addEventListener('change', e => setLoop(e.target.checked));
  $('bCreate').addEventListener('click', create);
  $('bCancel').addEventListener('click', askExit);
  $('bRetry').addEventListener('click', changed);

  return { enter, exit, isActive: () => active };
})();
