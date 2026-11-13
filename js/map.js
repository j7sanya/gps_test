// ============================================================
// map.js — карта и всё, что на ней рисуется. MapLibre GL JS + векторные тайлы OpenFreeMap.
// Другие файлы не работают с картой напрямую, а вызывают STR.map.*
// Внутри MapLibre координаты [lon, lat], снаружи (трассы, GPS) — [lat, lon]: конвертируем здесь.
// Стиль карты выбирается в Настройки → Карта и запоминается на телефоне.
// ============================================================
STR.map = (function () {
  const U = STR.u;
  const KEY = 'strace_mapstyle_v1';
  const BASE = 'https://tiles.openfreemap.org/styles/';
  // [ключ, название, подпись, адрес стиля, цвета для миниатюры]
  const STYLES = [
    ['dark',     'Тёмная',       'Гоночная, как приложение',  BASE + 'dark',     ['#14181f', '#262c36', '#3a4350']],
    ['fiord',    'Фьорд',        'Тёмно-синяя, спокойная',    BASE + 'fiord',    ['#2b3c4e', '#3f566d', '#5d7a95']],
    ['positron', 'Светлая',      'Чистая, для яркого дня',    BASE + 'positron', ['#f2f3f0', '#ffffff', '#d4dadc']],
    ['liberty',  'Цветная',      'Классическая, как в навигаторе', BASE + 'liberty', ['#eef0e6', '#ffd47a', '#a8d8ea']],
    ['bright',   'Яркая',        'Контрастные дороги',        BASE + 'bright',   ['#f6f1e6', '#ff8a5c', '#9cd3a4']]
  ];
  const FALLBACK = 'liberty';
  const find = k => STYLES.find(s => s[0] === k);

  let styleKey = 'dark';
  try { const k = localStorage.getItem(KEY); if (find(k)) styleKey = k; } catch (e) {}
  const styleUrl = () => find(styleKey)[3];

  const map = new maplibregl.Map({
    container: 'map', style: styleUrl(), center: [20, 50], zoom: 3, maxZoom: 19,
    attributionControl: false, pitchWithRotate: false, dragRotate: false, fadeDuration: 150
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.touchZoomRotate.disableRotation();
  try { new ResizeObserver(() => map.resize()).observe(map.getContainer()); } catch (e) {}

  // ---------- Слой-линия, который переживает смену стиля ----------
  // Смена стиля стирает все наши слои, поэтому они пересоздаются на событие style.load.
  const EMPTY = { type: 'FeatureCollection', features: [] };
  function lineLayer(m, id, paint, layout) {
    let data = EMPTY;
    const pt = Object.assign({}, paint);
    function add() {
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data });
      if (!m.getLayer(id)) m.addLayer({ id, type: 'line', source: id, layout: Object.assign({ 'line-cap': 'round', 'line-join': 'round' }, layout), paint: pt });
    }
    m.on('style.load', add);
    try { add(); } catch (e) {}      // стиль ещё не загружен — добавится на style.load
    return {
      set(d) { data = d || EMPTY; const s = m.getSource(id); if (s) s.setData(data); },
      paint(k, v) { pt[k] = v; if (m.getLayer(id)) m.setPaintProperty(id, k, v); },
      remove() { m.off('style.load', add); try { if (m.getLayer(id)) m.removeLayer(id); if (m.getSource(id)) m.removeSource(id); } catch (e) {} }
    };
  }
  // Заливка (круг точности GPS)
  function fillLayer(m, id, paint) {
    let data = EMPTY;
    function add() {
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data });
      if (!m.getLayer(id)) m.addLayer({ id, type: 'fill', source: id, paint });
    }
    m.on('style.load', add);
    try { add(); } catch (e) {}
    return { set(d) { data = d || EMPTY; const s = m.getSource(id); if (s) s.setData(data); } };
  }

  const line = (coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
  const fc = (features) => ({ type: 'FeatureCollection', features });
  const ll = (p) => [p[1], p[0]];                    // [lat, lon] -> [lon, lat]
  function circlePoly(lat, lon, r) {                 // круг радиусом r метров (многоугольник)
    const pts = [], dLat = r / 111320, dLon = r / (111320 * Math.max(0.05, Math.cos(lat * Math.PI / 180)));
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]); }
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
  }
  function boundsOf(pts) {                           // pts: [[lat, lon], ...]
    const b = new maplibregl.LngLatBounds();
    pts.forEach(p => b.extend([p[1], p[0]]));
    return b;
  }
  // Названия по-русски там, где они есть в данных карты
  function russianLabels(m) {
    try {
      m.getStyle().layers.forEach(l => {
        const tf = l.layout && l.layout['text-field'];
        if (tf && JSON.stringify(tf).includes('name'))
          m.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:ru'], ['get', 'name']]);
      });
    } catch (e) {}
  }
  function dot(cls) { const d = document.createElement('div'); d.className = cls; return d; }

  // ---------- Наши слои на главной карте ----------
  const accFill = fillLayer(map, 'acc', { 'fill-color': '#19c8ff', 'fill-opacity': 0.14 });
  const rawLine = lineLayer(map, 'raw', { 'line-color': '#ff2d3d', 'line-width': 5, 'line-opacity': 1, 'line-dasharray': [1, 0] });  // «сырой» GPS-трек
  const snapLine = lineLayer(map, 'snap', { 'line-color': '#22d36b', 'line-width': 6, 'line-opacity': 0.95 });                      // трек по дорогам
  const routeLine = lineLayer(map, 'route', { 'line-color': '#22d36b', 'line-width': 6, 'line-opacity': 0.9 });                     // выбранная трасса
  const meMarker = new maplibregl.Marker({ element: dot('me-dot') });
  let meOn = false, routeMarks = [], first = true, snapped = [];

  // Стиль загрузился: русские подписи; сообщаем остальным
  let styleReady = false, styleTimer = null;
  const listeners = [];
  map.on('style.load', () => { styleReady = true; clearTimeout(styleTimer); russianLabels(map); listeners.forEach(f => { try { f(); } catch (e) {} }); });

  // Если стиль не загрузился (нет такого адреса / сеть) — запасная «Цветная» карта
  function guard() {
    clearTimeout(styleTimer);
    styleReady = false;
    styleTimer = setTimeout(() => { if (!styleReady && styleKey !== FALLBACK) fallback(); }, 9000);
  }
  function fallback() {
    styleKey = FALLBACK;
    U.setStatus && U.setStatus('Выбранный стиль карты недоступен, включена «Цветная».');
    map.setStyle(styleUrl(), { diff: false });
    guard();
  }
  map.on('error', e => { if (!styleReady && !(e && e.sourceId) && styleKey !== FALLBACK) fallback(); });
  guard();

  function setStyle(key) {
    if (!find(key) || key === styleKey) return;
    styleKey = key;
    try { localStorage.setItem(KEY, key); } catch (e) {}
    map.setStyle(styleUrl(), { diff: false });   // diff:false — полная перезагрузка, наши слои вернутся на style.load
    guard();
    listeners.forEach(f => { try { f(true); } catch (e) {} });
  }

  return {
    raw: () => map,   // сама карта MapLibre: нужна конструктору трасс (builder.js)
    styles: STYLES, getStyleKey: () => styleKey, setStyle, styleUrl,
    onStyle: f => listeners.push(f),     // f() — стиль перезагрузился; f(true) — стиль только что выбран
    lineLayer, fillLayer, line, fc, ll, boundsOf, russianLabels,

    // Показать «синюю точку» — где я. При первом определении центрируем карту.
    showMe(p) {
      meMarker.setLngLat([p.lon, p.lat]);
      if (!meOn) { meMarker.addTo(map); meOn = true; }
      accFill.set(fc([circlePoly(p.lat, p.lon, p.acc || 0)]));
      if (first) { map.jumpTo({ center: [p.lon, p.lat], zoom: 16 }); first = false; }
    },
    follow(p) { map.easeTo({ center: [p.lon, p.lat], duration: 500 }); },
    goTo(p) { map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 16), duration: 600 }); },

    // Красная линия записываемого трека. Каждая часть (segs) — отдельная линия, без соединений.
    drawTrack(segs) { rawLine.set(fc(segs.filter(s => s.length > 1).map(s => line(s.map(p => [p.lon, p.lat]))))); },
    clearTrack() {
      rawLine.set(EMPTY);
      rawLine.paint('line-opacity', 1); rawLine.paint('line-dasharray', [1, 0]);
      snapped = []; snapLine.set(EMPTY);
    },

    // Зелёная линия «по дорогам»; красный трек становится бледным пунктиром
    drawSnapped(geoms) {
      snapped = snapped.concat(geoms.map(g => line(g)));   // g: [[lon, lat], ...] (OSRM)
      snapLine.set(fc(snapped));
      rawLine.paint('line-opacity', 0.35); rawLine.paint('line-dasharray', [0.8, 1.6]);
    },

    // Показать трассу (lines — список линий, каждая — список точек [lat, lon]).
    // fit=false: не менять масштаб карты (во время заезда карта следует за вами)
    showRoute(lines, fit = true) {
      this.clearRoute();
      const all = [];
      lines.forEach(l => all.push(...l));
      routeLine.set(fc(lines.filter(l => l.length > 1).map(l => line(l.map(ll)))));
      if (!all.length) return;
      const mk = (p, cls, title) => { const e = dot('rt-pt ' + cls); e.title = title; routeMarks.push(new maplibregl.Marker({ element: e }).setLngLat(ll(p)).addTo(map)); };
      mk(all[0], 'st', 'Старт'); mk(all[all.length - 1], 'fn', 'Финиш');
      if (fit) map.fitBounds(boundsOf(all), { padding: 40, duration: 600, maxZoom: 18 });
    },
    clearRoute() { routeLine.set(EMPTY); routeMarks.forEach(m => m.remove()); routeMarks = []; }
  };
})();
